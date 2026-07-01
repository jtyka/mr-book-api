import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parsePagination, buildPagedResponse } from "@/lib/pagination";
import { publisherCreateSchema } from "@/lib/validation/publisher";
import { requireAuth } from "@/lib/require-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;
  const { page, size, sort, dir } = parsePagination(request, { sort: "name" });

  const allowedSorts = ["id", "name", "country"];
  const orderBy = allowedSorts.includes(sort) ? sort : "name";

  const [totalElements, items] = await Promise.all([
    prisma.publisher.count({ where: { userId } }),
    prisma.publisher.findMany({
      where: { userId },
      orderBy: { [orderBy]: dir },
      ...(size > 0 ? { skip: page * size, take: size } : {}),
    }),
  ]);

  return NextResponse.json(buildPagedResponse(items, totalElements, page, size));
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;
  const body = await request.json();
  const parsed = publisherCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const publisher = await prisma.publisher.create({
    data: {
      name: parsed.data.name,
      country: parsed.data.country ?? null,
      website: parsed.data.website ?? null,
      address: parsed.data.address ?? null,
      userId,
    },
  });

  return NextResponse.json(publisher, { status: 201 });
}
