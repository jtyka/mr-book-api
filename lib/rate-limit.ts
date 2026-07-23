import { prisma } from "./prisma";

// Forwarded-Header sind nur verlässlich, wenn ein vertrauenswürdiger Proxy
// (Vercel-Edge, eigener Reverse-Proxy) sie setzt bzw. überschreibt. Ist die API
// direkt erreichbar, kann jeder Client x-forwarded-for frei wählen und bekäme
// pro Fake-IP ein frisches Rate-Limit-Fenster — der Schutz wäre wirkungslos.
// Deshalb werden die Header nur mit TRUST_PROXY_HEADERS=true ausgewertet;
// andernfalls teilen sich alle Clients den "unknown"-Bucket.
const TRUST_PROXY_HEADERS = process.env.TRUST_PROXY_HEADERS === "true";

export function clientIp(request: Request): string {
  if (TRUST_PROXY_HEADERS) {
    const xff = request.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
    const realIp = request.headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;
  }
  return "unknown";
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

// DB-basiertes Sliding-Window-Rate-Limit. Zählt Versuche für einen Schlüssel im
// Fenster; bei Überschreitung wird blockiert. Funktioniert auch serverless, da
// der Zustand in der DB liegt (kein In-Memory/Redis nötig).
//
// Fail-open: Schlägt der DB-Zugriff fehl (z. B. veralteter Prisma-Client, DB
// nicht erreichbar), wird die Anfrage durchgelassen statt mit 500 abzubrechen.
// Bewusste Abwägung — Verfügbarkeit von Login/Registrierung geht hier vor dem
// Brute-Force-Schutz; der Fehler wird zur Diagnose geloggt.
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = new Date(now - windowMs);

  try {
    // Alte Einträge dieses Schlüssels aufräumen, damit die Tabelle nicht wächst.
    await prisma.authAttempt.deleteMany({
      where: { key, createdAt: { lt: windowStart } },
    });

    const attempts = await prisma.authAttempt.findMany({
      where: { key, createdAt: { gte: windowStart } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });

    if (attempts.length >= limit) {
      const oldest = attempts[0].createdAt.getTime();
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldest + windowMs - now) / 1000),
      );
      return { allowed: false, retryAfterSeconds };
    }

    await prisma.authAttempt.create({ data: { key } });
    return { allowed: true, retryAfterSeconds: 0 };
  } catch (err) {
    console.error(`[Rate-Limit] DB-Fehler für Schlüssel "${key}" — lasse Anfrage durch (fail-open):`, err);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
