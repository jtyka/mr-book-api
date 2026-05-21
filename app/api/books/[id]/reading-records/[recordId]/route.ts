import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";

type Params = { params: Promise<{ id: string; recordId: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
  const authError = await requireAuth(_request);
  if (authError) return authError;
  const { id, recordId } = await params;
  const record = await prisma.readingRecord.findFirst({
    where: { id: Number(recordId), bookId: Number(id) },
  });

  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.readingRecord.delete({ where: { id: Number(recordId) } });
  return new NextResponse(null, { status: 204 });
}
