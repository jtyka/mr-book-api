import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parsePagination, buildPagedResponse } from "@/lib/pagination";
import { bookCreateSchema } from "@/lib/validation/book";

const bookInclude = {
  authors: true,
  publisher: true,
  category: { include: { parent: true } },
  readingHistory: { orderBy: { startedAt: "desc" as const } },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatBook(book: any) {
  return {
    ...book,
    category: book.category
      ? {
          id: book.category.id,
          name: book.category.name,
          parentId: book.category.parentId,
          parentName: book.category.parent?.name ?? null,
        }
      : null,
  };
}

export async function GET(request: NextRequest) {
  const { page, size, sort, dir } = parsePagination(request, { sort: "title" });

  const sortMap: Record<string, object> = {
    title: { title: dir },
    publishedYear: { publishedYear: dir },
    rating: { rating: dir },
    id: { id: dir },
  };
  const orderBy = sortMap[sort] ?? sortMap.title;

  const [totalElements, items] = await Promise.all([
    prisma.book.count(),
    prisma.book.findMany({
      orderBy,
      include: bookInclude,
      ...(size > 0 ? { skip: page * size, take: size } : {}),
    }),
  ]);

  return NextResponse.json(
    buildPagedResponse(items.map(formatBook), totalElements, page, size)
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = bookCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { authorIds, publisherId, categoryId, ...data } = parsed.data;

  const book = await prisma.book.create({
    data: {
      ...data,
      isbn: data.isbn ?? null,
      pageCount: data.pageCount ?? null,
      publishedYear: data.publishedYear ?? null,
      language: data.language ?? null,
      description: data.description ?? null,
      rating: data.rating ?? null,
      review: data.review ?? null,
      publisherId: publisherId ?? null,
      categoryId: categoryId ?? null,
      authors: authorIds.length > 0
        ? { connect: authorIds.map((id) => ({ id })) }
        : undefined,
    },
    include: bookInclude,
  });

  return NextResponse.json(formatBook(book), { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const ids: number[] = await request.json();

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "Array of IDs required" }, { status: 400 });
  }

  const count = await prisma.$transaction(async (tx) => {
    // Delete reading records first
    await tx.readingRecord.deleteMany({ where: { bookId: { in: ids } } });
    // Prisma implicit M2M relations are auto-cleaned on delete
    const result = await tx.book.deleteMany({ where: { id: { in: ids } } });
    return result.count;
  });

  return NextResponse.json(count);
}
