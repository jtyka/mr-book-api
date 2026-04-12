import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
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
    prisma.book.count(),
    prisma.author.count(),
    prisma.publisher.count(),
    prisma.category.count(),
    prisma.readingRecord.count(),
    prisma.readingRecord.findMany({
      select: { bookId: true },
      distinct: ["bookId"],
    }),
    prisma.book.aggregate({
      _avg: { rating: true },
      where: { rating: { not: null } },
    }),
    prisma.book.aggregate({
      _avg: { pageCount: true },
      where: { pageCount: { not: null } },
    }),
  ]);

  const booksRead = booksReadResult.length;

  // Books by language
  const byLanguageRaw = await prisma.book.groupBy({
    by: ["language"],
    _count: { id: true },
    where: { language: { not: null } },
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
    where: { rating: { not: null } },
    orderBy: { rating: "asc" },
  });
  const booksByRating = byRatingRaw.map((r) => ({
    label: String(r.rating),
    count: r._count.id,
  }));

  // Books by category (top-level)
  const booksWithCategory = await prisma.book.findMany({
    where: { categoryId: { not: null } },
    select: {
      category: {
        select: {
          name: true,
          parent: { select: { name: true } },
        },
      },
    },
  });

  const categoryCountMap = new Map<string, number>();
  for (const b of booksWithCategory) {
    const label = b.category?.parent?.name ?? b.category?.name ?? "Ohne";
    categoryCountMap.set(label, (categoryCountMap.get(label) ?? 0) + 1);
  }
  const booksByCategory = Array.from(categoryCountMap.entries())
    .map(([label, count]) => ({ label, count }))
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
