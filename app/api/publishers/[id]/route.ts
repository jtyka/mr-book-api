import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publisherCreateSchema } from "@/lib/validation/publisher";
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
  const publisher = await prisma.publisher.findFirst({ where: { id: numId, userId } });
  if (!publisher) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(publisher);
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
  const existing = await prisma.publisher.findFirst({ where: { id: numId, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const parsed = publisherCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const publisher = await prisma.publisher.update({
    where: { id: numId },
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
  const auth = await requireAuth(_request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;
  const { id } = await params;
  const numId = parseId(id);
  if (numId === null) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  const existing = await prisma.publisher.findFirst({ where: { id: numId, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.publisher.delete({ where: { id: numId } });
  return new NextResponse(null, { status: 204 });
}
