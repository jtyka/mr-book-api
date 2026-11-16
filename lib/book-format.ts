import { Prisma } from "@prisma/client";

// Gemeinsame Include-Definition und Antwortform für Bücher (GET/POST/PUT
// /api/books, /api/books/[id] und die Cover-Endpunkte).
export const bookInclude = {
  authors: true,
  publisher: true,
  categories: { include: { parent: true } },
  readingHistory: { orderBy: { startedAt: "desc" as const } },
} satisfies Prisma.BookInclude;

type BookWithRelations = Prisma.BookGetPayload<{ include: typeof bookInclude }>;

export function formatBook(book: BookWithRelations) {
  return {
    ...book,
    categories: book.categories.map((c) => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId,
      parentName: c.parent?.name ?? null,
    })),
  };
}
