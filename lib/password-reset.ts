import { NextResponse } from "next/server";
import { generateToken, hashToken } from "./auth";
import { sendMail, webBaseUrl } from "./mail";
import { prisma } from "./prisma";
import { checkRateLimit, clientIp } from "./rate-limit";

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 60 Minuten

// Legt einen neuen Reset-Token an und verwirft ältere desselben Kontos, damit
// nur der zuletzt versendete Link gilt. In der DB liegt nur der SHA-256-Hash;
// der Klartext-Token geht ausschließlich in den Link der Mail.
export async function createPasswordResetToken(userId: number): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  await prisma.$transaction(async (tx) => {
    // Serialisiert gleichzeitige Anforderungen für dasselbe Konto, sonst
    // könnten zwei Transaktionen beide löschen und danach beide anlegen
    // (zwei gültige Links). Wird am Transaktionsende freigegeben.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`password-reset:${userId}`}))`;
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.passwordResetToken.create({
      data: { token: hashToken(token), userId, expiresAt },
    });
  });
  return token;
}

// Sucht einen gültigen Reset-Token (Klartext aus dem Link). Abgelaufene Tokens
// werden dabei gelöscht. Liefert null, wenn der Token fehlt oder abgelaufen ist.
export async function findValidResetToken(token: string) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { token: hashToken(token) },
    include: { user: { select: { email: true, emailVerified: true } } },
  });
  if (!record) return null;
  if (record.expiresAt < new Date()) {
    await prisma.passwordResetToken.deleteMany({ where: { id: record.id } });
    return null;
  }
  return record;
}

// Gemeinsames Limit für check und reset (gleicher Schlüssel): Wer Links
// durchprobiert, trifft beide Routen. Liefert die 429-Antwort oder null.
const TOKEN_RATE_LIMIT = 10; // Versuche pro 15 Minuten und IP
const TOKEN_RATE_WINDOW_MS = 15 * 60 * 1000;

export async function tokenRateLimitResponse(
  request: Request,
): Promise<NextResponse | null> {
  const rate = await checkRateLimit(
    `reset-password:ip:${clientIp(request)}`,
    TOKEN_RATE_LIMIT,
    TOKEN_RATE_WINDOW_MS,
  );
  if (rate.allowed) return null;
  return NextResponse.json(
    { error: "Zu viele Versuche. Bitte versuche es später erneut." },
    { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
  );
}

export const INVALID_RESET_LINK = "Der Link ist ungültig oder abgelaufen.";

export function buildPasswordResetUrl(token: string): string {
  return `${webBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

function resetEmailContent(url: string): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "Passwort für mr-book zurücksetzen";
  const text = [
    "Für dein mr-book-Konto wurde ein neues Passwort angefordert.",
    "",
    `Link zum Zurücksetzen: ${url}`,
    "",
    "Der Link ist 60 Minuten gültig und kann einmal verwendet werden.",
    "Wenn du kein neues Passwort angefordert hast, kannst du diese E-Mail ignorieren; dein Passwort bleibt dann unverändert.",
  ].join("\n");
  const html = `<p>Für dein mr-book-Konto wurde ein neues Passwort angefordert.</p>
<p><a href="${url}">${url}</a></p>
<p>Der Link ist 60 Minuten gültig und kann einmal verwendet werden. Wenn du kein neues Passwort angefordert hast, kannst du diese E-Mail ignorieren; dein Passwort bleibt dann unverändert.</p>`;
  return { subject, html, text };
}

// Ohne Mailversand lässt sich ein Reset-Link nur aus dem Log holen. Wer die
// Logs lesen kann, könnte damit jedes Konto übernehmen, daher ist das nur
// erlaubt, wenn es ausdrücklich gewollt ist: außerhalb von Production-Builds
// (lokale Entwicklung) oder mit LOG_RESET_LINKS=true (Staging zum Testen). In
// Vercel-Production wird nie geloggt. Die Adresse steht nicht in der Zeile.
function logFallback(url: string): void {
  const allowed =
    process.env.VERCEL_ENV !== "production" &&
    (process.env.NODE_ENV !== "production" ||
      process.env.LOG_RESET_LINKS === "true");
  if (!allowed) {
    console.error(
      "[Passwort-Reset] Kein Mailversand konfiguriert — Link wird nicht protokolliert.",
    );
    return;
  }
  console.log(`[Passwort-Reset] Kein Mailversand konfiguriert — Link: ${url}`);
}

export async function sendPasswordResetEmail(
  email: string,
  url: string,
): Promise<void> {
  const { subject, html, text } = resetEmailContent(url);
  const result = await sendMail(
    { to: email, subject, html, text },
    "Passwort-Reset",
  );
  if (result === "not-configured") logFallback(url);
}

// Hinweis nach erfolgreicher Änderung: fällt auf, wenn es jemand anderes war.
export async function sendPasswordChangedEmail(email: string): Promise<void> {
  const subject = "Dein mr-book-Passwort wurde geändert";
  const text = [
    "Das Passwort für dein mr-book-Konto wurde soeben geändert, alle Anmeldungen wurden beendet.",
    "",
    "Warst du das nicht, fordere über „Passwort vergessen?“ auf der Anmeldeseite sofort ein neues Passwort an.",
  ].join("\n");
  const html = `<p>Das Passwort für dein mr-book-Konto wurde soeben geändert, alle Anmeldungen wurden beendet.</p>
<p>Warst du das nicht, fordere über „Passwort vergessen?“ auf der Anmeldeseite sofort ein neues Passwort an.</p>`;
  // Reiner Hinweis: ohne Mailversand ist nichts zu tun, Fehler stehen im Log.
  await sendMail({ to: email, subject, html, text }, "Passwort-Reset");
}
