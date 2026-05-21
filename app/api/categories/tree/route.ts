import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";

interface CategoryTree {
  id: number;
  name: string;
  parentId: number | null;
  parentName: string | null;
  children: CategoryTree[];
}

export async function GET(request: NextRequest) {
  const authError = await requireAuth(request);
  if (authError) return authError;
  const allCategories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { parent: true },
  });

  const categoryMap = new Map<number, CategoryTree>();

  for (const c of allCategories) {
    categoryMap.set(c.id, {
      id: c.id,
      name: c.name,
      parentId: c.parentId,
      parentName: c.parent?.name ?? null,
      children: [],
    });
  }

  const roots: CategoryTree[] = [];
  for (const c of allCategories) {
    const node = categoryMap.get(c.id)!;
    if (c.parentId && categoryMap.has(c.parentId)) {
      categoryMap.get(c.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return NextResponse.json(roots);
}
