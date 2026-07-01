import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;
  const [
    totalBooks,
    totalAuthors,
    totalPublishers,
    totalCategories,
    totalReadingRecords,
    booksReadResult,
    ratingAgg,
    pageCountAgg,
  ] = await Promise.all([
    prisma.book.count({ where: { userId } }),
    prisma.author.count({ where: { userId } }),
    prisma.publisher.count({ where: { userId } }),
    prisma.category.count({ where: { userId } }),
    prisma.readingRecord.count({ where: { book: { userId } } }),
    prisma.readingRecord.findMany({
      where: { book: { userId } },
      select: { bookId: true },
      distinct: ["bookId"],
    }),
    prisma.book.aggregate({
      _avg: { rating: true },
      where: { userId, rating: { not: null } },
    }),
    prisma.book.aggregate({
      _avg: { pageCount: true },
      where: { userId, pageCount: { not: null } },
    }),
  ]);

  const booksRead = booksReadResult.length;

  // Books by language
  const byLanguageRaw = await prisma.book.groupBy({
    by: ["language"],
    _count: { id: true },
    where: { userId, language: { not: null } },
    orderBy: { _count: { id: "desc" } },
  });
  const booksByLanguage = byLanguageRaw.map((r) => ({
    label: r.language ?? "Unbekannt",
    count: r._count.id,
  }));

  // Books by rating
  const byRatingRaw = await prisma.book.groupBy({
    by: ["rating"],
    _count: { id: true },
    where: { userId, rating: { not: null } },
    orderBy: { rating: "asc" },
  });
  const booksByRating = byRatingRaw.map((r) => ({
    label: String(r.rating),
    count: r._count.id,
  }));

  // Books by category: top-level categories count distinct books in their
  // subtree (a book in several subcategories counts once); subcategories
  // are reported as children with their own distinct counts.
  const booksWithCategories = await prisma.book.findMany({
    where: { userId, categories: { some: {} } },
    select: {
      id: true,
      categories: {
        select: {
          name: true,
          parent: { select: { name: true } },
        },
      },
    },
  });

  const categoryMap = new Map<
    string,
    { books: Set<number>; children: Map<string, Set<number>> }
  >();
  for (const b of booksWithCategories) {
    for (const cat of b.categories) {
      const topLabel = cat.parent?.name ?? cat.name;
      let node = categoryMap.get(topLabel);
      if (!node) {
        node = { books: new Set(), children: new Map() };
        categoryMap.set(topLabel, node);
      }
      node.books.add(b.id);
      if (cat.parent) {
        let childBooks = node.children.get(cat.name);
        if (!childBooks) {
          childBooks = new Set();
          node.children.set(cat.name, childBooks);
        }
        childBooks.add(b.id);
      }
    }
  }
  const booksByCategory = Array.from(categoryMap.entries())
    .map(([label, node]) => ({
      label,
      count: node.books.size,
      children: Array.from(node.children.entries())
        .map(([childLabel, books]) => ({ label: childLabel, count: books.size }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    totalBooks,
    totalAuthors,
    totalPublishers,
    totalCategories,
    totalReadingRecords,
    booksRead,
    averageRating: ratingAgg._avg.rating ?? null,
    averagePageCount: pageCountAgg._avg.pageCount ?? null,
    booksByLanguage,
    booksByRating,
    booksByCategory,
  });
}
