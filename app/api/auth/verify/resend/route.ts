import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resendVerificationSchema } from "@/lib/validation/auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import {
  buildVerificationUrl,
  createVerificationToken,
  sendVerificationEmail,
} from "@/lib/verification";
import { parseJsonBody } from "@/lib/request-body";

// Zwei Dimensionen wie beim Login: pro IP (bremst das Durchprobieren vieler
// Adressen) und pro Konto (bremst verteilte Anfragen, die ein einzelnes Konto
// mit Mails fluten würden).
const RATE_LIMIT = 3; // Versuche pro Stunde
const RATE_WINDOW_MS = 60 * 60 * 1000;

// Neutrale Antwort — verrät nicht, ob ein Konto mit dieser Adresse existiert
// oder bereits bestätigt ist (kein User-Enumeration, analog zu register).
function neutralResponse(devVerifyUrl?: string) {
  return NextResponse.json(
    {
      message:
        "Wenn ein unbestätigtes Konto mit dieser Adresse existiert, senden wir einen neuen Bestätigungslink.",
      ...(devVerifyUrl ? { devVerifyUrl } : {}),
    },
    { status: 200 },
  );
}

export async function POST(request: Request) {
  const body = await parseJsonBody(request);
  const parsed = resendVerificationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  const { email } = parsed.data;

  const [ipRate, emailRate] = await Promise.all([
    checkRateLimit(`resend-verify:ip:${clientIp(request)}`, RATE_LIMIT, RATE_WINDOW_MS),
    checkRateLimit(
      `resend-verify:email:${email.toLowerCase()}`,
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

  const isDev = process.env.NODE_ENV !== "production";

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerified) {
    // Unbekannte und bereits bestätigte Konten bekommen keinen neuen Link —
    // aber dieselbe neutrale Antwort wie im Erfolgsfall.
    return neutralResponse();
  }

  // Alte Tokens verwerfen, damit nur der zuletzt versendete Link gültig ist.
  await prisma.verificationToken.deleteMany({ where: { userId: user.id } });

  const token = await createVerificationToken(user.id);
  const url = buildVerificationUrl(token);
  await sendVerificationEmail(email, url);

  return neutralResponse(isDev ? url : undefined);
}
