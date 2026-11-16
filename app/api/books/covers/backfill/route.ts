import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/request-body";
import { toIsbn13 } from "@/lib/isbn";
import { lookupCoverUrl } from "@/lib/book-lookup";
import { fetchCoverImage } from "@/lib/cover-import";
import { replaceBookCover } from "@/lib/book-cover";
import { isCoverStoreConfigured } from "@/lib/cover-store";

// 20 Aufrufe pro Minute und Nutzer
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 1000;

// Bücher je Aufruf
const BATCH_SIZE = 5;

// Je Buch laufen Lookup, Bildabruf und Upload nacheinander (im schlechtesten
// Fall je 5 s). Die Function darf deshalb länger laufen als der Standard; nach
// TIME_BUDGET_MS wird kein weiteres Buch mehr begonnen – der Client setzt mit
// `afterId` fort, es geht nichts verloren.
export const maxDuration = 60;
const TIME_BUDGET_MS = 25_000;

const backfillSchema = z.object({
  bookIds: z.array(z.number().int().positive()).max(1000).optional(),
  afterId: z.number().int().min(0).optional(),
  dryRun: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;

  const parsed = backfillSchema.safeParse((await parseJsonBody(request)) ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { bookIds, afterId = 0, dryRun = false } = parsed.data;

  if (!dryRun && !isCoverStoreConfigured()) {
    return NextResponse.json(
      { error: "Der Bildspeicher ist nicht eingerichtet." },
      { status: 503 },
    );
  }

  // Kandidaten: eigene Bücher mit ISBN und ohne Cover
  const candidates = (greaterThan: number): Prisma.BookWhereInput => ({
    userId,
    coverUrl: null,
    AND: [{ isbn: { not: null } }, { isbn: { not: "" } }],
    id: { gt: greaterThan, ...(bookIds ? { in: bookIds } : {}) },
  });

  if (dryRun) {
    const remaining = await prisma.book.count({ where: candidates(afterId) });
    return NextResponse.json({ processed: 0, found: 0, lastId: null, remaining });
  }

  // Nur echte Läufe zählen gegen das Limit; das reine Zählen (dryRun) ist eine
  // einzelne DB-Abfrage und ruft keine fremden Dienste auf.
  const rate = await checkRateLimit(`cover-backfill:user:${userId}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte versuche es später erneut." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const batch = await prisma.book.findMany({
    where: candidates(afterId),
    orderBy: { id: "asc" },
    take: BATCH_SIZE,
    select: { id: true, isbn: true, coverUrl: true },
  });

  const startedAt = Date.now();
  let found = 0;
  let processed = 0;
  let lastId: number | null = null;
  for (const book of batch) {
    // Zeitbudget: mindestens ein Buch je Aufruf, damit der Lauf vorankommt
    if (processed > 0 && Date.now() - startedAt > TIME_BUDGET_MS) break;
    processed++;
    lastId = book.id;
    try {
      const isbn = toIsbn13(book.isbn ?? "");
      if (!isbn) continue;
      const coverUrl = await lookupCoverUrl(isbn);
      if (!coverUrl) continue;
      const image = await fetchCoverImage(coverUrl);
      if (image.kind !== "found") continue;
      const updated = await replaceBookCover(userId, book, image.bytes, image.type, {
        onlyIfEmpty: true,
      });
      if (updated) found++;
    } catch (err) {
      // Ein Fehler bei einem Buch bricht den Aufruf nicht ab
      console.error(
        `[Cover-Nachladen] Buch ${book.id} fehlgeschlagen: ${err instanceof Error ? err.name : "unbekannt"}`,
      );
    }
  }

  const remaining =
    lastId === null ? 0 : await prisma.book.count({ where: candidates(lastId) });
  return NextResponse.json({ processed, found, lastId, remaining });
}
