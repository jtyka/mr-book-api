import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import {
  buildPasswordResetUrl,
  createPasswordResetToken,
  sendPasswordResetEmail,
} from "@/lib/password-reset";
import { parseJsonBody } from "@/lib/request-body";

// Zwei Dimensionen wie beim Login: pro IP (bremst das Durchprobieren vieler
// Adressen) und pro Konto (begrenzt, wie oft Fremde einem Konto Mails auslösen
// können).
const RATE_LIMIT = 3; // Anforderungen pro Stunde
const RATE_WINDOW_MS = 60 * 60 * 1000;

// Neutrale Antwort — verrät nicht, ob ein Konto mit dieser Adresse existiert
// (keine User-Enumeration).
function neutralResponse(devResetUrl?: string) {
  return NextResponse.json(
    {
      message:
        "Wenn ein Konto mit dieser Adresse existiert, senden wir dir einen Link zum Zurücksetzen. Er ist 60 Minuten gültig.",
      ...(devResetUrl ? { devResetUrl } : {}),
    },
    { status: 200 },
  );
}

// Legt Token und Mail für ein vorhandenes Konto an. Gibt den Link zurück (nur
// für den Dev-Modus gebraucht).
async function issueResetLink(email: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;
  const token = await createPasswordResetToken(user.id);
  const url = buildPasswordResetUrl(token);
  await sendPasswordResetEmail(email, url);
  return url;
}

export async function POST(request: Request) {
  const body = await parseJsonBody(request);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  const { email } = parsed.data;

  const [ipRate, emailRate] = await Promise.all([
    checkRateLimit(`forgot-password:ip:${clientIp(request)}`, RATE_LIMIT, RATE_WINDOW_MS),
    checkRateLimit(
      `forgot-password:email:${email.toLowerCase()}`,
      RATE_LIMIT,
      RATE_WINDOW_MS,
    ),
  ]);
  if (!ipRate.allowed || !emailRate.allowed) {
    const retryAfterSeconds = Math.max(
      ipRate.retryAfterSeconds,
      emailRate.retryAfterSeconds,
    );
    return NextResponse.json(
      { error: "Zu viele Versuche. Bitte versuche es später erneut." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  // Lokal den Link in der Antwort mitliefern (wie devVerifyUrl bei der
  // Registrierung); dort spielt die Antwortzeit keine Rolle.
  if (process.env.NODE_ENV !== "production") {
    const url = await issueResetLink(email).catch((error) => {
      console.error("[Passwort-Reset] Anforderung fehlgeschlagen:", error);
      return null;
    });
    return neutralResponse(url ?? undefined);
  }

  // Sonst die gesamte Arbeit nach der Antwort erledigen, damit die Antwortzeit
  // nicht verrät, ob es das Konto gibt (Nachschlagen, Token, Mailversand).
  after(async () => {
    try {
      await issueResetLink(email);
    } catch (error) {
      console.error("[Passwort-Reset] Anforderung fehlgeschlagen:", error);
    }
  });
  return neutralResponse();
}
