import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-auth";
import { parsePagination, buildPagedResponse } from "@/lib/pagination";
import { adminUserSelect, formatAdminUser } from "@/lib/admin-users";

const SORTABLE = new Set(["id", "email", "name", "createdAt"]);

// Nutzerliste für die Admin-Ansicht. Liefert nur Kontodaten und die Anzahl
// der Bücher, keine Inhalte fremder Bibliotheken.
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { page, size, sort, dir } = parsePagination(request, {
    sort: "createdAt",
    size: 50,
  });
  const orderBy = { [SORTABLE.has(sort) ? sort : "createdAt"]: dir };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      select: adminUserSelect,
      orderBy,
      skip: page * size,
      take: size,
    }),
    prisma.user.count(),
  ]);

  return NextResponse.json(
    buildPagedResponse(users.map(formatAdminUser), total, page, size),
  );
}
