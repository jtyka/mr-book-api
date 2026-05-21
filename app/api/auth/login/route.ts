import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { loginSchema } from "@/lib/validation/auth";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ungültige Eingabe" },
      { status: 400 },
    );
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

  const session = await createSession(user.id);

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
  });
}
