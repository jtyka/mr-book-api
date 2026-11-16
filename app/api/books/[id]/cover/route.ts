import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseId } from "@/lib/params";
import { bookInclude, formatBook } from "@/lib/book-format";
import { replaceBookCover } from "@/lib/book-cover";
import {
  MAX_COVER_BYTES,
  deleteCover,
  detectImageType,
  isCoverStoreConfigured,
} from "@/lib/cover-store";

type Params = { params: Promise<{ id: string }> };

// Upload und Import teilen sich das Limit: 30 pro Minute und Nutzer
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 1000;

// Spielraum für multipart-Rahmen um die 1-MB-Datei
const MAX_BODY_BYTES = MAX_COVER_BYTES + 64 * 1024;

const NOT_CONFIGURED = "Der Bildspeicher ist nicht eingerichtet.";
const INVALID_IMAGE = "Bitte ein Bild im Format JPEG, PNG oder WebP wählen.";

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;
  const { id } = await params;
  const numId = parseId(id);
  if (numId === null) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  if (!isCoverStoreConfigured()) {
    return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });
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

  const tooLarge = () =>
    NextResponse.json({ error: "Das Bild ist zu groß (höchstens 1 MB)." }, { status: 413 });

  // Große Uploads schon anhand des Headers abweisen, bevor der Body gelesen wird
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return tooLarge();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: INVALID_IMAGE }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: INVALID_IMAGE }, { status: 400 });
  }
  if (file.size > MAX_COVER_BYTES) return tooLarge();

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) return NextResponse.json({ error: INVALID_IMAGE }, { status: 400 });

  let updated;
  try {
    updated = await replaceBookCover(userId, book, bytes, type);
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

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;
  const { id } = await params;
  const numId = parseId(id);
  if (numId === null) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  if (!isCoverStoreConfigured()) {
    return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });
  }

  const book = await prisma.book.findFirst({
    where: { id: numId, userId },
    select: { id: true, coverUrl: true },
  });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Erst die Datenbank ändern, dann die Datei löschen (Best-Effort)
  const updated = await prisma.book.update({
    where: { id: numId },
    data: { coverUrl: null },
    include: bookInclude,
  });
  await deleteCover(book.coverUrl);
  return NextResponse.json(formatBook(updated));
}
