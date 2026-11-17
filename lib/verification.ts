import { generateToken, hashToken } from "./auth";
import { prisma } from "./prisma";
import { sendMail, webBaseUrl } from "./mail";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 Stunden

// Auch hier landet nur der SHA-256-Hash in der DB; der Klartext-Token geht
// ausschließlich in den Bestätigungslink.
export async function createVerificationToken(userId: number): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
  await prisma.verificationToken.create({
    data: { token: hashToken(token), userId, expiresAt },
  });
  return token;
}

export function buildVerificationUrl(token: string): string {
  return `${webBaseUrl()}/verify?token=${encodeURIComponent(token)}`;
}

function verificationEmailContent(url: string): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "Bitte bestätige deine E-Mail-Adresse";
  const text = [
    "Bitte bestätige deine E-Mail-Adresse für mr-book.",
    "",
    `Bestätigungslink: ${url}`,
    "",
    "Der Link ist 24 Stunden gültig.",
    "Wenn du dich nicht registriert hast, kannst du diese E-Mail ignorieren.",
  ].join("\n");
  const html = `<p>Bitte bestätige deine E-Mail-Adresse für mr-book.</p>
<p><a href="${url}">${url}</a></p>
<p>Der Link ist 24 Stunden gültig. Wenn du dich nicht registriert hast, kannst du diese E-Mail ignorieren.</p>`;
  return { subject, html, text };
}

// Fallback, wenn kein Mailversand konfiguriert (bzw. konfigurierbar) ist:
// Bestätigungslink nur loggen.
function logFallback(email: string, url: string): void {
  console.log(
    `[E-Mail-Verifizierung] Kein Mailversand konfiguriert — Bestätigungslink für ${email}: ${url}`,
  );
}

// Versendet den Bestätigungslink per Resend (siehe lib/mail.ts). Ohne
// konfigurierten Mailversand wird der Link wie bisher nur geloggt.
export async function sendVerificationEmail(
  email: string,
  url: string,
): Promise<void> {
  const { subject, html, text } = verificationEmailContent(url);
  const result = await sendMail(
    { to: email, subject, html, text },
    "E-Mail-Verifizierung",
  );
  if (result === "not-configured") logFallback(email, url);
}
