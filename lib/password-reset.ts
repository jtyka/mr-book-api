import { generateToken, hashToken } from "./auth";
import { sendMail, webBaseUrl } from "./mail";
import { prisma } from "./prisma";

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 60 Minuten

// Legt einen neuen Reset-Token an und verwirft ältere desselben Kontos, damit
// nur der zuletzt versendete Link gilt. In der DB liegt nur der SHA-256-Hash;
// der Klartext-Token geht ausschließlich in den Link der Mail.
export async function createPasswordResetToken(userId: number): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
    prisma.passwordResetToken.create({
      data: { token: hashToken(token), userId, expiresAt },
    }),
  ]);
  return token;
}

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

// Ohne Mailversand lässt sich ein Reset-Link nur aus dem Log holen (lokal und
// auf Staging zum Testen). In Production ist das tabu: Wer die Logs lesen kann,
// könnte sonst jedes Konto übernehmen.
function logFallback(email: string, url: string): void {
  if (process.env.VERCEL_ENV === "production") {
    console.error(
      "[Passwort-Reset] Kein Mailversand konfiguriert — Link wird in Production nicht protokolliert.",
    );
    return;
  }
  console.log(
    `[Passwort-Reset] Kein Mailversand konfiguriert — Link für ${email}: ${url}`,
  );
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
  if (result === "not-configured") logFallback(email, url);
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
