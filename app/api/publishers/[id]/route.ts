import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publisherCreateSchema } from "@/lib/validation/publisher";
import { requireAuth } from "@/lib/require-auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const authError = await requireAuth(_request);
  if (authError) return authError;
  const { id } = await params;
  const publisher = await prisma.publisher.findUnique({ where: { id: Number(id) } });
  if (!publisher) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(publisher);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const authError = await requireAuth(request);
  if (authError) return authError;
  const { id } = await params;
  const existing = await prisma.publisher.findUnique({ where: { id: Number(id) } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const parsed = publisherCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const publisher = await prisma.publisher.update({
    where: { id: Number(id) },
    data: {
      name: parsed.data.name,
      country: parsed.data.country ?? null,
      website: parsed.data.website ?? null,
      address: parsed.data.address ?? null,
    },
  });

  return NextResponse.json(publisher);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const authError = await requireAuth(_request);
  if (authError) return authError;
  const { id } = await params;
  const existing = await prisma.publisher.findUnique({ where: { id: Number(id) } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.publisher.delete({ where: { id: Number(id) } });
  return new NextResponse(null, { status: 204 });
}
