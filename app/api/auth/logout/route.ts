import { NextResponse } from "next/server";
import { deleteSession, extractToken } from "@/lib/auth";

export async function POST(request: Request) {
  const token = extractToken(request);
  if (token) {
    await deleteSession(token);
  }
  return new NextResponse(null, { status: 204 });
}
