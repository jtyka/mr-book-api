import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bookCreateSchema } from "@/lib/validation/book";

type Params = { params: Promise<{ id: string }> };

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

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const book = await prisma.book.findUnique({
    where: { id: Number(id) },
    include: bookInclude,
  });

  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(formatBook(book));
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const numId = Number(id);
  const existing = await prisma.book.findUnique({
    where: { id: numId },
    include: { authors: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const parsed = bookCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { authorIds, publisherId, categoryId, ...data } = parsed.data;

  const book = await prisma.book.update({
    where: { id: numId },
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
      authors: {
        set: authorIds.map((aid) => ({ id: aid })),
      },
    },
    include: bookInclude,
  });

  return NextResponse.json(formatBook(book));
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const numId = Number(id);
  const existing = await prisma.book.findUnique({ where: { id: numId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.readingRecord.deleteMany({ where: { bookId: numId } });
    await tx.book.delete({ where: { id: numId } });
  });

  return new NextResponse(null, { status: 204 });
}
