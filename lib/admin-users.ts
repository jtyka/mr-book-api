import type { Prisma } from "@prisma/client";

// Gemeinsame Select-Definition für die Nutzerliste und die PATCH-Antwort der
// Admin-Endpunkte. Bewusst ohne passwordHash, Tokens und Bibliotheksinhalte.
export const adminUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  emailVerified: true,
  disabledAt: true,
  createdAt: true,
  _count: { select: { books: true } },
  // Letzter Login = jüngste Session (Sessions entstehen beim Login und beim
  // Bestätigen der E-Mail).
  sessions: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { createdAt: true },
  },
} satisfies Prisma.UserSelect;

type AdminUserRow = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>;

export function formatAdminUser(u: AdminUserRow) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    emailVerified: u.emailVerified,
    disabledAt: u.disabledAt,
    createdAt: u.createdAt,
    bookCount: u._count.books,
    lastLoginAt: u.sessions[0]?.createdAt ?? null,
  };
}
