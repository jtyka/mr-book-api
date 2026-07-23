import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { loginSchema } from "@/lib/validation/auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

// Zwei Dimensionen: pro IP (bremst einen Angreifer, der viele Konten probiert)
// und pro Konto (bremst verteilte Angriffe auf ein einzelnes Konto, die das
// IP-Limit umgehen würden).
const RATE_LIMIT_IP = 10; // Login-Versuche pro 15 Minuten und IP
const RATE_LIMIT_EMAIL = 10; // Login-Versuche pro 15 Minuten und Konto
const RATE_WINDOW_MS = 15 * 60 * 1000;

// Erzwingt eine bestätigte E-Mail vor dem Login. Standardmäßig aus, damit ohne
// angebundenen Mailversand niemand ausgesperrt wird. Zum Aktivieren:
// REQUIRE_EMAIL_VERIFICATION=true (setzt echten Mailversand voraus).
const REQUIRE_VERIFICATION =
  process.env.REQUIRE_EMAIL_VERIFICATION === "true";

// Argon2-Hash eines Zufallswerts (Parameter wie in lib/password.ts). Wird bei
// unbekannter E-Mail verifiziert, damit die Antwortzeit nicht verrät, ob das
// Konto existiert (User-Enumeration per Timing).
const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$REB/2Zjqasdxy2Wj3rGRFw$I0qvzhCmxiloajx7DRpMSQSfwZ6p7A8UefK9BqtrY9Y";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  const { email, password } = parsed.data;

  const [ipRate, emailRate] = await Promise.all([
    checkRateLimit(`login:ip:${clientIp(request)}`, RATE_LIMIT_IP, RATE_WINDOW_MS),
    checkRateLimit(
      `login:email:${email.toLowerCase()}`,
      RATE_LIMIT_EMAIL,
      RATE_WINDOW_MS,
    ),
  ]);
  if (!ipRate.allowed || !emailRate.allowed) {
    const retryAfterSeconds = Math.max(
      ipRate.retryAfterSeconds,
      emailRate.retryAfterSeconds,
    );
    return NextResponse.json(
      { error: "Zu viele Anmeldeversuche. Bitte versuche es später erneut." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Auch bei unbekannter E-Mail wird ein Hash geprüft, damit beide Fälle
  // gleich lange dauern.
  const valid = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, password);
  if (!user || !valid) {
    return NextResponse.json(
      { error: "E-Mail oder Passwort falsch" },
      { status: 401 },
    );
  }

  // Verifizierungs-Check erst nach korrektem Passwort: wer das Passwort kennt,
  // weiß ohnehin, dass das Konto existiert — verrät also nichts zusätzlich.
  if (REQUIRE_VERIFICATION && !user.emailVerified) {
    return NextResponse.json(
      { error: "Bitte bestätige zuerst deine E-Mail-Adresse." },
      { status: 403 },
    );
  }

  const session = await createSession(user.id);

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
  });
}
