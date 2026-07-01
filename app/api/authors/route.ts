import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parsePagination, buildPagedResponse } from "@/lib/pagination";
import { authorCreateSchema } from "@/lib/validation/author";
import { requireAuth } from "@/lib/require-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;
  const { page, size, sort, dir } = parsePagination(request, { sort: "lastName" });

  const sortMap: Record<string, object> = {
    lastName: { lastName: dir },
    firstName: { firstName: dir },
    nationality: { nationality: dir },
    id: { id: dir },
  };
  const orderBy = sortMap[sort] ?? sortMap.lastName;

  const [totalElements, items] = await Promise.all([
    prisma.author.count({ where: { userId } }),
    prisma.author.findMany({
      where: { userId },
      orderBy,
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
  const parsed = authorCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const author = await prisma.author.create({
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : null,
      nationality: parsed.data.nationality ?? null,
      email: parsed.data.email ?? null,
      website: parsed.data.website ?? null,
      userId,
    },
  });

  return NextResponse.json(author, { status: 201 });
}
