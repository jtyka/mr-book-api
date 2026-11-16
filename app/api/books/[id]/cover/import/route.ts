import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseId } from "@/lib/params";
import { parseJsonBody } from "@/lib/request-body";
import { formatBook } from "@/lib/book-format";
import { replaceBookCover } from "@/lib/book-cover";
import { isCoverStoreConfigured } from "@/lib/cover-store";
import { fetchCoverImage } from "@/lib/cover-import";
import { safeCoverUrl } from "@/lib/book-lookup/sanitize";

type Params = { params: Promise<{ id: string }> };

// Gemeinsames Limit mit dem Upload (gleicher Schlüssel)
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 1000;

const importSchema = z.object({ sourceUrl: z.string().max(2000) });

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;
  const { id } = await params;
  const numId = parseId(id);
  if (numId === null) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  if (!isCoverStoreConfigured()) {
    return NextResponse.json(
      { error: "Der Bildspeicher ist nicht eingerichtet." },
      { status: 503 },
    );
  }

  const rate = await checkRateLimit(`cover:user:${userId}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte versuche es später erneut." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const book = await prisma.book.findFirst({
    where: { id: numId, userId },
    select: { id: true, coverUrl: true },
  });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = importSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const sourceUrl = safeCoverUrl(parsed.data.sourceUrl);
  if (!sourceUrl) {
    return NextResponse.json({ error: "Diese Cover-Adresse ist nicht erlaubt." }, { status: 400 });
  }

  const fetched = await fetchCoverImage(sourceUrl);
  if (fetched.kind === "none") {
    return NextResponse.json(
      { error: "Für dieses Buch wurde kein Cover gefunden." },
      { status: 404 },
    );
  }
  if (fetched.kind === "unavailable") {
    return NextResponse.json(
      { error: "Die Cover-Quelle ist gerade nicht erreichbar." },
      { status: 502 },
    );
  }

  let updated;
  try {
    updated = await replaceBookCover(userId, book, fetched.bytes, fetched.type);
  } catch (err) {
    console.error(
      `[Cover] Speichern fehlgeschlagen: ${err instanceof Error ? err.name : "unbekannt"}`,
    );
    return NextResponse.json(
      { error: "Das Cover konnte nicht gespeichert werden. Bitte später erneut versuchen." },
      { status: 502 },
    );
  }
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(formatBook(updated));
}
