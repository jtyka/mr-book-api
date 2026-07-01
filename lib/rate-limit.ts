import { prisma } from "./prisma";

// Ermittelt die Client-IP aus den üblichen Proxy-Headern (Vercel/Reverse-Proxy
// setzen x-forwarded-for). Fällt auf "unknown" zurück, sodass sich Angreifer
// ohne IP-Header einen gemeinsamen Bucket teilen statt gar keins.
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

// DB-basiertes Sliding-Window-Rate-Limit. Zählt Versuche für einen Schlüssel im
// Fenster; bei Überschreitung wird blockiert. Funktioniert auch serverless, da
// der Zustand in der DB liegt (kein In-Memory/Redis nötig).
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = new Date(now - windowMs);

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
}
