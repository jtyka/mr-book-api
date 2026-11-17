import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearSessionCookie } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import {
  PASSWORD_EQUALS_EMAIL_MESSAGE,
  passwordMatchesEmail,
  passwordSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";
import {
  findValidResetToken,
  INVALID_RESET_LINK,
  sendPasswordChangedEmail,
  tokenRateLimitResponse,
} from "@/lib/password-reset";
import { parseJsonBody } from "@/lib/request-body";

class TokenAlreadyUsedError extends Error {}

// Löst einen Reset-Token ein: setzt das neue Passwort, beendet alle Sitzungen
// des Kontos und verbraucht alle offenen Tokens. Meldet bewusst nicht an — die
// Anmeldung prüft das neue Passwort gleich.
export async function POST(request: Request) {
  const body = await parseJsonBody(request);
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  const limited = await tokenRateLimitResponse(request);
  if (limited) return limited;

  const { token, password } = parsed.data;

  const record = await findValidResetToken(token);
  if (!record) {
    return NextResponse.json({ error: INVALID_RESET_LINK }, { status: 400 });
  }

  // Passwort-Regeln vor dem Hashen prüfen: ungültige Anfragen kosten keine
  // Argon2-Rechenzeit, und der Token bleibt für einen neuen Versuch gültig.
  const policy = passwordSchema.safeParse(password);
  if (!policy.success) {
    return NextResponse.json(
      { error: policy.error.issues[0]?.message ?? "Ungültiges Passwort" },
      { status: 400 },
    );
  }
  if (passwordMatchesEmail(password, record.user.email)) {
    return NextResponse.json(
      { error: PASSWORD_EQUALS_EMAIL_MESSAGE },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(password);

  try {
    await prisma.$transaction(async (tx) => {
      // Token zuerst löschen und die Anzahl prüfen: Zwei gleichzeitige
      // Anfragen mit demselben Link dürfen nicht beide durchkommen.
      const consumed = await tx.passwordResetToken.deleteMany({
        where: { id: record.id },
      });
      if (consumed.count !== 1) throw new TokenAlreadyUsedError();

      await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          // Der Link beweist den Zugriff auf das Postfach.
          emailVerified: record.user.emailVerified ?? new Date(),
        },
      });
      await tx.passwordResetToken.deleteMany({ where: { userId: record.userId } });
      await tx.verificationToken.deleteMany({ where: { userId: record.userId } });
      await tx.session.deleteMany({ where: { userId: record.userId } });
    });
  } catch (error) {
    if (error instanceof TokenAlreadyUsedError) {
      return NextResponse.json({ error: INVALID_RESET_LINK }, { status: 400 });
    }
    throw error;
  }

  // Hinweis-Mail nach der Antwort; ein Fehler dort ändert nichts am Ergebnis.
  const email = record.user.email;
  after(async () => {
    try {
      await sendPasswordChangedEmail(email);
    } catch (error) {
      console.error("[Passwort-Reset] Hinweis-Mail fehlgeschlagen:", error);
    }
  });

  const response = new NextResponse(null, { status: 204 });
  clearSessionCookie(response);
  return response;
}
