import { NextResponse } from "next/server";
import { clearSessionCookie, deleteSession, extractToken } from "@/lib/auth";

export async function POST(request: Request) {
  const token = extractToken(request);
  if (token) {
    await deleteSession(token);
  }
  const response = new NextResponse(null, { status: 204 });
  clearSessionCookie(response);
  return response;
}
