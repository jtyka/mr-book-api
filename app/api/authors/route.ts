import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parsePagination, buildPagedResponse } from "@/lib/pagination";
import { authorCreateSchema } from "@/lib/validation/author";

export async function GET(request: NextRequest) {
  const { page, size, sort, dir } = parsePagination(request, { sort: "lastName" });

  const sortMap: Record<string, object> = {
    lastName: { lastName: dir },
    firstName: { firstName: dir },
    nationality: { nationality: dir },
    id: { id: dir },
  };
  const orderBy = sortMap[sort] ?? sortMap.lastName;

  const [totalElements, items] = await Promise.all([
    prisma.author.count(),
    prisma.author.findMany({
      orderBy,
      ...(size > 0 ? { skip: page * size, take: size } : {}),
    }),
  ]);

  return NextResponse.json(buildPagedResponse(items, totalElements, page, size));
}

export async function POST(request: NextRequest) {
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
    },
  });

  return NextResponse.json(author, { status: 201 });
}
