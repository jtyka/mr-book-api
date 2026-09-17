import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-auth";
import { parseId } from "@/lib/params";
import { parseJsonBody } from "@/lib/request-body";
import { adminUserUpdateSchema } from "@/lib/validation/admin";
import { adminUserSelect, formatAdminUser } from "@/lib/admin-users";

// Admin-Aktionen an einem Konto: E-Mail bestätigen, sperren, entsperren.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const id = parseId((await params).id);
  if (id === null) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }

  const body = await parseJsonBody(request);
  const parsed = adminUserUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }
  const { emailVerified, disabled } = parsed.data;

  // Wer sich selbst sperrt, sperrt womöglich den einzigen Admin aus.
  if (disabled === true && id === auth.id) {
    return NextResponse.json(
      { error: "Das eigene Konto kann nicht gesperrt werden." },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { emailVerified: true, disabledAt: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Nutzer nicht gefunden" }, { status: 404 });
  }

  const user = await prisma.$transaction(async (tx) => {
    const data: { emailVerified?: Date; disabledAt?: Date | null } = {};

    if (emailVerified && !existing.emailVerified) {
      data.emailVerified = new Date();
      // Offene Bestätigungslinks sind damit überflüssig.
      await tx.verificationToken.deleteMany({ where: { userId: id } });
    }

    if (disabled === true && !existing.disabledAt) {
      data.disabledAt = new Date();
      // Sperre wirkt sofort: alle Sessions des Kontos beenden.
      await tx.session.deleteMany({ where: { userId: id } });
    } else if (disabled === false && existing.disabledAt) {
      data.disabledAt = null;
    }

    return tx.user.update({ where: { id }, data, select: adminUserSelect });
  });

  return NextResponse.json(formatAdminUser(user));
}
