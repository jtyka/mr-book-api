import { createHash, randomBytes } from "crypto";
import type { NextResponse } from "next/server";
import { prisma } from "./prisma";


// "Angemeldet bleiben": 30 Tage persistent. Sonst 12 Stunden serverseitig und
// ein Session-Cookie, das beim Schließen des Browsers verfällt.
const SESSION_TTL_REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TTL_SHORT_MS = 12 * 60 * 60 * 1000;

export function generateToken(): string {
  return randomBytes(48).toString("base64url");
}

// In der DB liegt nur der SHA-256-Hash des Tokens. Bei einem DB-Leak (Dump,
// Backup, kompromittierte DB) lassen sich damit keine Sessions übernehmen —
// den Klartext-Token kennt ausschließlich der Client.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export async function createSession(userId: number, rememberMe = false) {
  const token = generateToken();
  const ttl = rememberMe ? SESSION_TTL_REMEMBER_MS : SESSION_TTL_SHORT_MS;
  const expiresAt = new Date(Date.now() + ttl);

  // Abgelaufene Sessions des Nutzers aufräumen.
  await prisma.session.deleteMany({
    where: { userId, expiresAt: { lt: new Date() } },
  });

  await prisma.session.create({
    data: { token: hashToken(token), userId, expiresAt },
  });

  return { token, expiresAt, rememberMe };
}

export async function validateSession(token: string) {
  const session = await prisma.session.findUnique({
    where: { token: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true } } },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } });
    }
    return null;
  }

  return session.user;
}

export async function deleteSession(token: string) {
  await prisma.session.deleteMany({ where: { token: hashToken(token) } });
}

// SameSite aus SESSION_COOKIE_SAMESITE; ungültige Werte fallen auf "lax".
// "none" erfordert Secure und wird in Vercel-Prod ignoriert (nur für Stage).
function cookieConfig() {
  const raw = process.env.SESSION_COOKIE_SAMESITE?.toLowerCase();
  const sameSite =
    raw === "none" && process.env.VERCEL_ENV !== "production" ? "none" : "lax";
  const secure = process.env.NODE_ENV === "production" || sameSite === "none";
  return {
    // __Host- (nur mit Secure erlaubt) verhindert, dass Subdomains das Cookie überschreiben.
    name: secure ? "__Host-mr_book_session" : "mr_book_session",
    options: { httpOnly: true, path: "/", secure, sameSite } as const,
  };
}

export function setSessionCookie(
  response: NextResponse,
  session: { token: string; expiresAt: Date; rememberMe: boolean },
) {
  const { name, options } = cookieConfig();
  response.cookies.set(name, session.token, {
    ...options,
    // Ohne maxAge bleibt es ein Session-Cookie.
    ...(session.rememberMe
      ? {
          maxAge: Math.floor(
            (session.expiresAt.getTime() - Date.now()) / 1000,
          ),
        }
      : {}),
  });
}

export function clearSessionCookie(response: NextResponse) {
  const { name, options } = cookieConfig();
  response.cookies.set(name, "", { ...options, maxAge: 0 });
}

export function extractToken(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  const { name: cookieName } = cookieConfig();
  let token: string | null = null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === cookieName) {
      // Mehrfach vorhandenes Cookie (untergeschoben) -> nicht vertrauen.
      if (token !== null) return null;
      token = rest.join("=");
    }
  }
  return token || null;
}
