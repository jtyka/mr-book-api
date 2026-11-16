import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { toIsbn13 } from "@/lib/isbn";
import { lookupIsbn } from "@/lib/book-lookup";

// 30 Nachschlagevorgänge pro Minute und Nutzer
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 1000;

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const isbn = toIsbn13(request.nextUrl.searchParams.get("isbn") ?? "");
  if (!isbn) {
    return NextResponse.json({ error: "Ungültige ISBN" }, { status: 400 });
  }

  const rate = await checkRateLimit(
    `isbn-lookup:user:${auth.id}`,
    RATE_LIMIT,
    RATE_WINDOW_MS,
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte versuche es später erneut." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const outcome = await lookupIsbn(isbn);
  if (outcome.kind === "unavailable") {
    return NextResponse.json(
      { error: "Die Buchdaten-Dienste sind gerade nicht erreichbar" },
      { status: 502 },
    );
  }
  if (outcome.kind === "not-found") {
    return NextResponse.json(
      { error: "Zu dieser ISBN wurde nichts gefunden" },
      { status: 404 },
    );
  }
  return NextResponse.json(outcome.result);
}
