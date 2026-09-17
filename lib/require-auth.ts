import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { extractToken, validateSession } from "./auth";

export type AuthUser = { id: number; email: string; name: string; role: Role };

// Gibt den angemeldeten Nutzer zurück oder eine 401-Response.
// Aufrufer-Muster:
//   const auth = await requireAuth(request);
//   if (auth instanceof NextResponse) return auth;
//   const userId = auth.id;
export async function requireAuth(
  request: Request,
): Promise<AuthUser | NextResponse> {
  const token = extractToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Nicht authentifiziert" },
      { status: 401 },
    );
  }

  const user = await validateSession(token);
  if (!user) {
    return NextResponse.json(
      { error: "Session abgelaufen" },
      { status: 401 },
    );
  }

  return user;
}

// Wie requireAuth, verlangt zusätzlich die Rolle ADMIN. Nicht-Admins
// bekommen 403.
export async function requireAdmin(
  request: Request,
): Promise<AuthUser | NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "ADMIN") {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }
  return auth;
}
