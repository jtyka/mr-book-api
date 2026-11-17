import { NextResponse } from "next/server";
import { resetTokenSchema } from "@/lib/validation/auth";
import {
  findValidResetToken,
  INVALID_RESET_LINK,
  tokenRateLimitResponse,
} from "@/lib/password-reset";
import { parseJsonBody } from "@/lib/request-body";

// Prüft, ob ein Reset-Token gültig ist, ohne ihn zu verbrauchen. Die Seite
// zeigt damit gleich beim Öffnen des Links das Formular oder die Fehlermeldung.
export async function POST(request: Request) {
  const body = await parseJsonBody(request);
  const parsed = resetTokenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültiger Token" }, { status: 400 });
  }

  const limited = await tokenRateLimitResponse(request);
  if (limited) return limited;

  const record = await findValidResetToken(parsed.data.token);
  if (!record) {
    return NextResponse.json({ error: INVALID_RESET_LINK }, { status: 400 });
  }

  return new NextResponse(null, { status: 204 });
}
