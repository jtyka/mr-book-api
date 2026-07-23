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

// Versendet den Bestätigungslink. Aktuell nur geloggt ("Struktur ohne Versand").
// TODO: Hier einen echten E-Mail-Provider (z. B. Resend) anbinden.
export async function sendVerificationEmail(
  email: string,
  url: string,
): Promise<void> {
  console.log(`[E-Mail-Verifizierung] Bestätigungslink für ${email}: ${url}`);
}
