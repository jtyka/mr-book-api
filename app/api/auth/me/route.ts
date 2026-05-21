import { NextResponse } from "next/server";
import { extractToken, validateSession } from "@/lib/auth";

export async function GET(request: Request) {
  const token = extractToken(request);
  if (!token) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const user = await validateSession(token);
  if (!user) {
    return NextResponse.json({ error: "Session abgelaufen" }, { status: 401 });
  }

  return NextResponse.json({ user });
}
