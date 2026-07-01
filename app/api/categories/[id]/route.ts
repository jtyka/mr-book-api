import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { categoryCreateSchema } from "@/lib/validation/category";
import { requireAuth } from "@/lib/require-auth";

type Params = { params: Promise<{ id: string }> };

interface CategoryTree {
  id: number;
  name: string;
  parentId: number | null;
  parentName: string | null;
  children: CategoryTree[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildTree(category: any): CategoryTree {
  return {
    id: category.id,
    name: category.name,
    parentId: category.parentId,
    parentName: category.parent?.name ?? null,
    children: category.children.map((child: { id: number; name: string; parentId: number | null }) => ({
      id: child.id,
      name: child.name,
      parentId: child.parentId,
      parentName: category.name,
      children: [],
    })),
  };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireAuth(_request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;
  const { id } = await params;
  const category = await prisma.category.findFirst({
    where: { id: Number(id), userId },
    include: { parent: true, children: { orderBy: { name: "asc" } } },
  });

  if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(buildTree(category));
}

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;
  const { id } = await params;
  const numId = Number(id);
  const existing = await prisma.category.findFirst({ where: { id: numId, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const parsed = categoryCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.parentId === numId) {
    return NextResponse.json({ error: "Category cannot be its own parent" }, { status: 400 });
  }

  if (parsed.data.parentId) {
    const parent = await prisma.category.findFirst({
      where: { id: parsed.data.parentId, userId },
    });
    if (!parent) {
      return NextResponse.json({ error: "Parent category not found" }, { status: 400 });
    }
  }

  const category = await prisma.category.update({
    where: { id: numId },
    data: {
      name: parsed.data.name,
      parentId: parsed.data.parentId ?? null,
    },
    include: { parent: true, children: { orderBy: { name: "asc" } } },
  });

  return NextResponse.json(buildTree(category));
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requireAuth(_request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;
  const { id } = await params;
  const numId = Number(id);
  const existing = await prisma.category.findFirst({
    where: { id: numId, userId },
    include: { children: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    // Re-parent children to grandparent
    await tx.category.updateMany({
      where: { parentId: numId },
      data: { parentId: existing.parentId },
    });
    await tx.category.delete({ where: { id: numId } });
  });

  return new NextResponse(null, { status: 204 });
}
