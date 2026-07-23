import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, hashToken } from "@/lib/auth";
import { verifyEmailSchema } from "@/lib/validation/auth";
import { parseJsonBody } from "@/lib/request-body";

// Löst einen Bestätigungs-Token ein: markiert die E-Mail als verifiziert,
// verbraucht den Token und meldet den Nutzer direkt an.
export async function POST(request: Request) {
  const body = await parseJsonBody(request);
  const parsed = verifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültiger Token" }, { status: 400 });
  }

  const record = await prisma.verificationToken.findUnique({
    where: { token: hashToken(parsed.data.token) },
    include: { user: true },
  });

  if (!record || record.expiresAt < new Date()) {
    if (record) {
      await prisma.verificationToken.delete({ where: { id: record.id } });
    }
    return NextResponse.json(
      { error: "Der Bestätigungslink ist ungültig oder abgelaufen." },
      { status: 400 },
    );
  }

  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: record.userId },
      data: { emailVerified: record.user.emailVerified ?? new Date() },
    });
    // Alle offenen Tokens dieses Nutzers verbrauchen.
    await tx.verificationToken.deleteMany({ where: { userId: record.userId } });
    return updated;
  });

  const session = await createSession(user.id);

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
  });
}
