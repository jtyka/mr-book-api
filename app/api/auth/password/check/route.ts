import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth";
import { resetTokenSchema } from "@/lib/validation/auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/request-body";

// Gilt gemeinsam für check und reset (gleicher Schlüssel).
const RATE_LIMIT = 10; // Versuche pro 15 Minuten und IP
const RATE_WINDOW_MS = 15 * 60 * 1000;

// Prüft, ob ein Reset-Token gültig ist, ohne ihn zu verbrauchen. Die Seite
// zeigt damit gleich beim Öffnen des Links das Formular oder die Fehlermeldung.
export async function POST(request: Request) {
  const body = await parseJsonBody(request);
  const parsed = resetTokenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültiger Token" }, { status: 400 });
  }

  const rate = await checkRateLimit(
    `reset-password:ip:${clientIp(request)}`,
    RATE_LIMIT,
    RATE_WINDOW_MS,
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Zu viele Versuche. Bitte versuche es später erneut." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { token: hashToken(parsed.data.token) },
  });

  if (!record || record.expiresAt < new Date()) {
    if (record) {
      await prisma.passwordResetToken.deleteMany({ where: { id: record.id } });
    }
    return NextResponse.json(
      { error: "Der Link ist ungültig oder abgelaufen." },
      { status: 400 },
    );
  }

  return new NextResponse(null, { status: 204 });
}
