import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { parseId } from "@/lib/params";

type Params = { params: Promise<{ id: string; recordId: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requireAuth(_request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;
  const { id, recordId } = await params;
  const bookId = parseId(id);
  const numRecordId = parseId(recordId);
  if (bookId === null || numRecordId === null) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  const record = await prisma.readingRecord.findFirst({
    where: { id: numRecordId, bookId, book: { userId } },
  });

  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.readingRecord.delete({ where: { id: numRecordId } });
  return new NextResponse(null, { status: 204 });
}
