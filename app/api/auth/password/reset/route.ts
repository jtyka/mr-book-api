import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearSessionCookie, hashToken } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import {
  PASSWORD_EQUALS_EMAIL_MESSAGE,
  passwordMatchesEmail,
  passwordSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { sendPasswordChangedEmail } from "@/lib/password-reset";
import { parseJsonBody } from "@/lib/request-body";

// Gilt gemeinsam für check und reset (gleicher Schlüssel).
const RATE_LIMIT = 10; // Versuche pro 15 Minuten und IP
const RATE_WINDOW_MS = 15 * 60 * 1000;

const INVALID_LINK = "Der Link ist ungültig oder abgelaufen.";

class TokenAlreadyUsedError extends Error {}

// Löst einen Reset-Token ein: setzt das neue Passwort, beendet alle Sitzungen
// des Kontos und verbraucht alle offenen Tokens. Meldet bewusst nicht an — die
// Anmeldung prüft das neue Passwort gleich.
export async function POST(request: Request) {
  const body = await parseJsonBody(request);
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
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

  const { token, password } = parsed.data;

  const record = await prisma.passwordResetToken.findUnique({
    where: { token: hashToken(token) },
    include: { user: { select: { id: true, email: true, emailVerified: true } } },
  });

  if (!record || record.expiresAt < new Date()) {
    if (record) {
      await prisma.passwordResetToken.deleteMany({ where: { id: record.id } });
    }
    return NextResponse.json({ error: INVALID_LINK }, { status: 400 });
  }

  // Passwort-Regeln vor dem Hashen prüfen: ungültige Anfragen kosten keine
  // Argon2-Rechenzeit, und der Token bleibt für einen neuen Versuch gültig.
  const policy = passwordSchema.safeParse(password);
  if (!policy.success) {
    return NextResponse.json(
      { error: policy.error.issues[0]?.message ?? "Ungültiges Passwort" },
      { status: 400 },
    );
  }
  if (passwordMatchesEmail(password, record.user.email)) {
    return NextResponse.json(
      { error: PASSWORD_EQUALS_EMAIL_MESSAGE },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(password);

  try {
    await prisma.$transaction(async (tx) => {
      // Token zuerst löschen und die Anzahl prüfen: Zwei gleichzeitige
      // Anfragen mit demselben Link dürfen nicht beide durchkommen.
      const consumed = await tx.passwordResetToken.deleteMany({
        where: { id: record.id },
      });
      if (consumed.count !== 1) throw new TokenAlreadyUsedError();

      await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          // Der Link beweist den Zugriff auf das Postfach.
          emailVerified: record.user.emailVerified ?? new Date(),
        },
      });
      await tx.passwordResetToken.deleteMany({ where: { userId: record.userId } });
      await tx.verificationToken.deleteMany({ where: { userId: record.userId } });
      await tx.session.deleteMany({ where: { userId: record.userId } });
    });
  } catch (error) {
    if (error instanceof TokenAlreadyUsedError) {
      return NextResponse.json({ error: INVALID_LINK }, { status: 400 });
    }
    throw error;
  }

  // Hinweis-Mail nach der Antwort; ein Fehler dort ändert nichts am Ergebnis.
  const email = record.user.email;
  after(async () => {
    try {
      await sendPasswordChangedEmail(email);
    } catch (error) {
      console.error("[Passwort-Reset] Hinweis-Mail fehlgeschlagen:", error);
    }
  });

  const response = new NextResponse(null, { status: 204 });
  clearSessionCookie(response);
  return response;
}
