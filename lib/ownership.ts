import { NextResponse } from "next/server";
import { prisma } from "./prisma";

// Stellt sicher, dass alle referenzierten Autoren, Kategorien und der Verlag
// dem angegebenen Nutzer gehören. Verhindert, dass ein Buch mit fremden
// Ressourcen verknüpft wird. Gibt bei Verstoß eine 400-Response zurück, sonst null.
export async function assertOwnedRelations(
  userId: number,
  refs: {
    authorIds?: number[];
    categoryIds?: number[];
    publisherId?: number | null;
  },
): Promise<NextResponse | null> {
  const authorIds = [...new Set(refs.authorIds ?? [])];
  if (authorIds.length > 0) {
    const count = await prisma.author.count({
      where: { id: { in: authorIds }, userId },
    });
    if (count !== authorIds.length) {
      return NextResponse.json({ error: "Ungültige Autoren" }, { status: 400 });
    }
  }

  const categoryIds = [...new Set(refs.categoryIds ?? [])];
  if (categoryIds.length > 0) {
    const count = await prisma.category.count({
      where: { id: { in: categoryIds }, userId },
    });
    if (count !== categoryIds.length) {
      return NextResponse.json({ error: "Ungültige Kategorien" }, { status: 400 });
    }
  }

  if (refs.publisherId != null) {
    const publisher = await prisma.publisher.findFirst({
      where: { id: refs.publisherId, userId },
    });
    if (!publisher) {
      return NextResponse.json({ error: "Ungültiger Verlag" }, { status: 400 });
    }
  }

  return null;
}
