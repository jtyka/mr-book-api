import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bookCreateSchema } from "@/lib/validation/book";
import { requireAuth } from "@/lib/require-auth";

type Params = { params: Promise<{ id: string }> };

const bookInclude = {
  authors: true,
  publisher: true,
  categories: { include: { parent: true } },
  readingHistory: { orderBy: { startedAt: "desc" as const } },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatBook(book: any) {
  return {
    ...book,
    categories: (book.categories ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId,
      parentName: c.parent?.name ?? null,
    })),
  };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const authError = await requireAuth(_request);
  if (authError) return authError;
  const { id } = await params;
  const book = await prisma.book.findUnique({
    where: { id: Number(id) },
    include: bookInclude,
  });

  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(formatBook(book));
}

export async function PUT(request: NextRequest, { params }: Params) {
  const authError = await requireAuth(request);
  if (authError) return authError;
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

  const { authorIds, publisherId, categoryIds, ...data } = parsed.data;

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
      categories: {
        set: categoryIds.map((cid) => ({ id: cid })),
      },
      authors: {
        set: authorIds.map((aid) => ({ id: aid })),
      },
    },
    include: bookInclude,
  });

  return NextResponse.json(formatBook(book));
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const authError = await requireAuth(_request);
  if (authError) return authError;
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
