import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const parsedOrigins = (process.env.WEB_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS =
  parsedOrigins.length > 0 ? parsedOrigins : ["http://localhost:3001"];

function getCorsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
    // Antworten enthalten nutzerbezogene Daten und dürfen nicht gecacht werden.
    "Cache-Control": "private, no-store",
    "Access-Control-Max-Age": "86400",
  };
}

export function proxy(request: NextRequest) {
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: getCorsHeaders(request),
    });
  }

  const corsHeaders = getCorsHeaders(request);

  // CSRF-Schutz: Das Session-Cookie wird vom Browser automatisch mitgeschickt.
  // SameSite=Lax schützt nicht vor anderen *.jtyka.de-Subdomains (same-site),
  // daher muss der Origin zustandsändernder Requests exakt erlaubt sein.
  const origin = request.headers.get("origin");
  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) &&
    (!origin || !ALLOWED_ORIGINS.includes(origin))
  ) {
    return NextResponse.json(
      { error: "Ungültige Herkunft" },
      { status: 403, headers: corsHeaders },
    );
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = { matcher: "/api/:path*" };
