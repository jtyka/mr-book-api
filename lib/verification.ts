import { generateToken, hashToken } from "./auth";
import { prisma } from "./prisma";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 Stunden

// Basis-URL des Frontends (für den Bestätigungslink). Nutzt den ersten Eintrag
// aus WEB_ORIGINS, sonst den lokalen Dev-Server.
function webBaseUrl(): string {
  const origins = (process.env.WEB_ORIGINS ?? "http://localhost:3001")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return origins[0] ?? "http://localhost:3001";
}

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

// Knapp halten: Auf Vercel teilt sich der Versand das Laufzeitbudget der
// Function mit Rate-Limit-Check, Argon2-Hashing und DB-Zugriffen.
const RESEND_TIMEOUT_MS = 5_000;

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

// Versendet den Bestätigungslink per Resend (HTTP-API, kein SDK). Ohne
// konfigurierten RESEND_API_KEY wird der Link wie bisher nur geloggt.
export async function sendVerificationEmail(
  email: string,
  url: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logFallback(email, url);
    return;
  }

  const from = process.env.MAIL_FROM;
  if (!from) {
    console.error(
      "[E-Mail-Verifizierung] RESEND_API_KEY gesetzt, aber MAIL_FROM fehlt — Mailversand nicht möglich.",
    );
    logFallback(email, url);
    return;
  }

  const { subject, html, text } = verificationEmailContent(url);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [email], subject, html, text }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(
        `[E-Mail-Verifizierung] Resend-Versand fehlgeschlagen (Status ${response.status}): ${body.slice(0, 500)}`,
      );
    }
  } catch (error) {
    console.error(
      "[E-Mail-Verifizierung] Resend-Versand fehlgeschlagen (Netzwerk-/Timeout-Fehler):",
      error,
    );
  }
}
