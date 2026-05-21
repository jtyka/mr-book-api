import { NextResponse } from "next/server";
import { extractToken, validateSession } from "./auth";

export async function requireAuth(request: Request) {
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

  return null; // auth OK
}
