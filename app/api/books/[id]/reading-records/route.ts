import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readingRecordCreateSchema } from "@/lib/validation/book";
import { requireAuth } from "@/lib/require-auth";
import { parseId } from "@/lib/params";
import { parseJsonBody } from "@/lib/request-body";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireAuth(_request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;
  const { id } = await params;
  const bookId = parseId(id);
  if (bookId === null) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  const book = await prisma.book.findFirst({ where: { id: bookId, userId } });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const records = await prisma.readingRecord.findMany({
    where: { bookId },
    orderBy: { startedAt: "desc" },
  });

  return NextResponse.json(records);
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;
  const { id } = await params;
  const bookId = parseId(id);
  if (bookId === null) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  const book = await prisma.book.findFirst({ where: { id: bookId, userId } });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const body = await parseJsonBody(request);
  const parsed = readingRecordCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const record = await prisma.readingRecord.create({
    data: {
      bookId,
      startedAt: parsed.data.startedAt ? new Date(parsed.data.startedAt) : null,
      startedAtPrecision: parsed.data.startedAt
        ? parsed.data.startedAtPrecision ?? "DAY"
        : null,
      readAt: parsed.data.readAt ? new Date(parsed.data.readAt) : null,
      readAtPrecision: parsed.data.readAt
        ? parsed.data.readAtPrecision ?? "DAY"
        : null,
    },
  });

  return NextResponse.json(record, { status: 201 });
}
