import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { registerSchema } from "@/lib/validation/auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import {
  buildVerificationUrl,
  createVerificationToken,
  sendVerificationEmail,
} from "@/lib/verification";
import { parseJsonBody } from "@/lib/request-body";
import { createDefaultCategories } from "@/lib/default-categories";

const RATE_LIMIT = 5; // Registrierungen
const RATE_WINDOW_MS = 60 * 60 * 1000; // pro Stunde und IP

// Neutrale Antwort — verrät nicht, ob die E-Mail bereits existiert (kein
// User-Enumeration). Im Dev-Modus wird der Verifizierungslink mitgeliefert,
// solange noch kein echter Mailversand angebunden ist.
function neutralResponse(devVerifyUrl?: string) {
  return NextResponse.json(
    {
      message:
        "Wenn die Adresse noch nicht registriert ist, senden wir dir eine Bestätigungs-E-Mail. Bitte bestätige sie, um dein Konto zu aktivieren.",
      ...(devVerifyUrl ? { devVerifyUrl } : {}),
    },
    { status: 200 },
  );
}

export async function POST(request: Request) {
  const rate = await checkRateLimit(
    `register:${clientIp(request)}`,
    RATE_LIMIT,
    RATE_WINDOW_MS,
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Zu viele Versuche. Bitte versuche es später erneut." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const body = await parseJsonBody(request);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ungültige Eingabe", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { email, password, name } = parsed.data;
  const isDev = process.env.NODE_ENV !== "production";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Neutrale Antwort statt 409 — keine Auskunft über vorhandene Konten.
    return neutralResponse();
  }

  const passwordHash = await hashPassword(password);
  // User und Standard-Kategorienbaum gemeinsam anlegen, damit kein User
  // ohne Kategorien entsteht (z. B. bei einem Fehler mitten in der Anlage).
  // Timeout bewusst höher als der Prisma-Default (5 s), da ein Neon-Cold-Start
  // allein schon einen Teil davon aufbrauchen kann.
  let user;
  try {
    user = await prisma.$transaction(
      async (tx) => {
        const createdUser = await tx.user.create({
          data: { email, passwordHash, name },
        });
        await createDefaultCategories(tx, createdUser.id);
        return createdUser;
      },
      { timeout: 15_000 },
    );
  } catch (error) {
    console.error("[Registrierung] Anlegen von User/Kategorien fehlgeschlagen:", error);
    return NextResponse.json(
      { error: "Registrierung fehlgeschlagen. Bitte versuche es später erneut." },
      { status: 500 },
    );
  }

  const token = await createVerificationToken(user.id);
  const url = buildVerificationUrl(token);
  await sendVerificationEmail(email, url);

  return neutralResponse(isDev ? url : undefined);
}
