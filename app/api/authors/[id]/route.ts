import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorCreateSchema } from "@/lib/validation/author";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const author = await prisma.author.findUnique({ where: { id: Number(id) } });
  if (!author) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(author);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const existing = await prisma.author.findUnique({ where: { id: Number(id) } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const parsed = authorCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const author = await prisma.author.update({
    where: { id: Number(id) },
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : null,
      nationality: parsed.data.nationality ?? null,
    },
  });

  return NextResponse.json(author);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const existing = await prisma.author.findUnique({ where: { id: Number(id) } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.author.delete({ where: { id: Number(id) } });
  return new NextResponse(null, { status: 204 });
}
