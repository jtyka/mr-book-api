import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { categoryCreateSchema } from "@/lib/validation/category";
import { requireAuth } from "@/lib/require-auth";

export async function GET(request: NextRequest) {
  const authError = await requireAuth(request);
  if (authError) return authError;
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { parent: true },
  });

  const result = categories.map((c) => ({
    id: c.id,
    name: c.name,
    parentId: c.parentId,
    parentName: c.parent?.name ?? null,
  }));

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const authError = await requireAuth(request);
  if (authError) return authError;
  const body = await request.json();
  const parsed = categoryCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.parentId) {
    const parent = await prisma.category.findUnique({ where: { id: parsed.data.parentId } });
    if (!parent) {
      return NextResponse.json({ error: "Parent category not found" }, { status: 400 });
    }
  }

  const category = await prisma.category.create({
    data: {
      name: parsed.data.name,
      parentId: parsed.data.parentId ?? null,
    },
    include: { parent: true },
  });

  return NextResponse.json(
    {
      id: category.id,
      name: category.name,
      parentId: category.parentId,
      parentName: category.parent?.name ?? null,
      children: [],
    },
    { status: 201 }
  );
}
