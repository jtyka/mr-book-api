import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearSessionCookie } from "@/lib/auth";
import { requireAuth } from "@/lib/require-auth";

// Meldet den Nutzer auf allen Geräten ab (löscht sämtliche Sessions).
export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  await prisma.session.deleteMany({ where: { userId: auth.id } });

  const response = new NextResponse(null, { status: 204 });
  clearSessionCookie(response);
  return response;
}
