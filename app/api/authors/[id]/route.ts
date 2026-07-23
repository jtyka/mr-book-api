import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorCreateSchema } from "@/lib/validation/author";
import { requireAuth } from "@/lib/require-auth";
import { parseId } from "@/lib/params";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireAuth(_request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;
  const { id } = await params;
  const numId = parseId(id);
  if (numId === null) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  const author = await prisma.author.findFirst({ where: { id: numId, userId } });
  if (!author) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(author);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;
  const { id } = await params;
  const numId = parseId(id);
  if (numId === null) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  const existing = await prisma.author.findFirst({ where: { id: numId, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const parsed = authorCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const author = await prisma.author.update({
    where: { id: numId },
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : null,
      nationality: parsed.data.nationality ?? null,
      email: parsed.data.email ?? null,
      website: parsed.data.website ?? null,
    },
  });

  return NextResponse.json(author);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requireAuth(_request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;
  const { id } = await params;
  const numId = parseId(id);
  if (numId === null) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  const existing = await prisma.author.findFirst({ where: { id: numId, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.author.delete({ where: { id: numId } });
  return new NextResponse(null, { status: 204 });
}
