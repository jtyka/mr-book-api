import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { loginSchema } from "@/lib/validation/auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

const RATE_LIMIT = 10; // Login-Versuche
const RATE_WINDOW_MS = 15 * 60 * 1000; // pro 15 Minuten und IP

// Erzwingt eine bestätigte E-Mail vor dem Login. Standardmäßig aus, damit ohne
// angebundenen Mailversand niemand ausgesperrt wird. Zum Aktivieren:
// REQUIRE_EMAIL_VERIFICATION=true (setzt echten Mailversand voraus).
const REQUIRE_VERIFICATION =
  process.env.REQUIRE_EMAIL_VERIFICATION === "true";

export async function POST(request: Request) {
  const rate = await checkRateLimit(
    `login:${clientIp(request)}`,
    RATE_LIMIT,
    RATE_WINDOW_MS,
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anmeldeversuche. Bitte versuche es später erneut." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const body = await request.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json(
      { error: "E-Mail oder Passwort falsch" },
      { status: 401 },
    );
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
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
