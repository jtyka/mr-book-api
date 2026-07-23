import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parsePagination, buildPagedResponse } from "@/lib/pagination";
import { bookCreateSchema, bookIdsSchema } from "@/lib/validation/book";
import { requireAuth } from "@/lib/require-auth";
import { assertOwnedRelations } from "@/lib/ownership";

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

// Liefert die ID der Kategorie samt aller Nachfahren im Kategoriebaum (nur eigene Kategorien)
async function categoryIdsWithDescendants(
  categoryId: number,
  userId: number,
): Promise<number[]> {
  const all = await prisma.category.findMany({
    where: { userId },
    select: { id: true, parentId: true },
  });
  const childrenByParent = new Map<number, number[]>();
  for (const c of all) {
    if (c.parentId === null) continue;
    const siblings = childrenByParent.get(c.parentId) ?? [];
    siblings.push(c.id);
    childrenByParent.set(c.parentId, siblings);
  }
  const ids: number[] = [];
  const queue = [categoryId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    ids.push(id);
    queue.push(...(childrenByParent.get(id) ?? []));
  }
  return ids;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;
  const { page, size, sort, dir } = parsePagination(request, { sort: "title" });

  const sortMap: Record<string, object> = {
    title: { title: dir },
    publishedYear: { publishedYear: dir },
    rating: { rating: dir },
    id: { id: dir },
  };
  const orderBy = sortMap[sort] ?? sortMap.title;

  const categoryId = parseInt(
    request.nextUrl.searchParams.get("categoryId") ?? "",
    10
  );
  const where: Prisma.BookWhereInput = { userId };
  if (Number.isFinite(categoryId)) {
    where.categories = {
      some: { id: { in: await categoryIdsWithDescendants(categoryId, userId) } },
    };
  }

  const [totalElements, items] = await Promise.all([
    prisma.book.count({ where }),
    prisma.book.findMany({
      where,
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
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;
  const body = await request.json();
  const parsed = bookCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { authorIds, publisherId, categoryIds, ...data } = parsed.data;

  const ownershipError = await assertOwnedRelations(userId, {
    authorIds,
    categoryIds,
    publisherId,
  });
  if (ownershipError) return ownershipError;

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
      userId,
      categories: categoryIds.length > 0
        ? { connect: categoryIds.map((id) => ({ id })) }
        : undefined,
      authors: authorIds.length > 0
        ? { connect: authorIds.map((id) => ({ id })) }
        : undefined,
    },
    include: bookInclude,
  });

  return NextResponse.json(formatBook(book), { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;
  const body = await request.json().catch(() => null);
  const parsedIds = bookIdsSchema.safeParse(body);
  if (!parsedIds.success) {
    return NextResponse.json({ error: "Array of IDs required" }, { status: 400 });
  }
  const ids = parsedIds.data;

  const count = await prisma.$transaction(async (tx) => {
    // Nur eigene Bücher berücksichtigen
    const owned = await tx.book.findMany({
      where: { id: { in: ids }, userId },
      select: { id: true },
    });
    const ownedIds = owned.map((b) => b.id);
    if (ownedIds.length === 0) return 0;
    // Delete reading records first
    await tx.readingRecord.deleteMany({ where: { bookId: { in: ownedIds } } });
    // Prisma implicit M2M relations are auto-cleaned on delete
    const result = await tx.book.deleteMany({ where: { id: { in: ownedIds } } });
    return result.count;
  });

  return NextResponse.json(count);
}
