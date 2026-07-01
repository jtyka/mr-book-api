import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { categoryCreateSchema } from "@/lib/validation/category";
import { requireAuth } from "@/lib/require-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;
  const categories = await prisma.category.findMany({
    where: { userId },
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
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;
  const body = await request.json();
  const parsed = categoryCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.parentId) {
    const parent = await prisma.category.findFirst({
      where: { id: parsed.data.parentId, userId },
    });
    if (!parent) {
      return NextResponse.json({ error: "Parent category not found" }, { status: 400 });
    }
  }

  const category = await prisma.category.create({
    data: {
      name: parsed.data.name,
      parentId: parsed.data.parentId ?? null,
      userId,
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
