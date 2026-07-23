import { createHash, randomBytes } from "crypto";
import { prisma } from "./prisma";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function generateToken(): string {
  return randomBytes(48).toString("base64url");
}

// In der DB liegt nur der SHA-256-Hash des Tokens. Bei einem DB-Leak (Dump,
// Backup, kompromittierte DB) lassen sich damit keine Sessions übernehmen —
// den Klartext-Token kennt ausschließlich der Client.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export async function createSession(userId: number) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: { token: hashToken(token), userId, expiresAt },
  });

  return { token, expiresAt };
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

export function extractToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}
