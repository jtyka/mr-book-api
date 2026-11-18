import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { parseId } from "@/lib/params";
import { parseJsonBody } from "@/lib/request-body";
import { readingRecordPatchSchema } from "@/lib/validation/book";
import type { Prisma } from "@prisma/client";

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

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
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

  const body = await parseJsonBody(request);
  const parsed = readingRecordPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { finished, readAt, readAtPrecision } = parsed.data;

  // Zusammengeführter Zustand: ein unfertiger Eintrag darf kein Lesedatum haben
  const nextFinished = finished ?? record.finished;
  const nextHasReadAt = readAt !== undefined ? !!readAt : record.readAt !== null;
  if (!nextFinished && nextHasReadAt) {
    return NextResponse.json(
      {
        error: {
          formErrors: [],
          fieldErrors: {
            readAt: ["Ein nicht abgeschlossener Eintrag darf kein Lesedatum haben"],
          },
        },
      },
      { status: 400 },
    );
  }

  if (!nextFinished && !record.startedAt) {
    return NextResponse.json(
      {
        error: {
          formErrors: [],
          fieldErrors: {
            startedAt: ["Ein nicht abgeschlossener Eintrag braucht ein Beginn-Datum"],
          },
        },
      },
      { status: 400 },
    );
  }

  const data: Prisma.ReadingRecordUpdateInput = {};
  if (finished !== undefined) data.finished = finished;
  if (readAt !== undefined) {
    data.readAt = readAt ? new Date(readAt) : null;
    data.readAtPrecision = readAt ? readAtPrecision ?? "DAY" : null;
  } else if (readAtPrecision !== undefined && record.readAt) {
    data.readAtPrecision = readAtPrecision ?? "DAY";
  }

  const updated = await prisma.readingRecord.update({
    where: { id: numRecordId },
    data,
  });
  return NextResponse.json(updated);
}
