import { z } from "zod";
import { optionalDateString } from "./common";

export const bookCreateSchema = z.object({
  title: z.string().min(1, "Titel ist erforderlich").max(500),
  isbn: z.string().max(32).nullable().optional(),
  pageCount: z.number().int().positive().nullable().optional(),
  publishedYear: z.number().int().min(-3000).max(3000).nullable().optional(),
  language: z.string().max(50).nullable().optional(),
  description: z.string().max(10000).nullable().optional(),
  rating: z.number().int().min(1).max(10).nullable().optional(),
  review: z.string().max(20000).nullable().optional(),
  authorIds: z.array(z.number().int().positive()).max(100).optional().default([]),
  publisherId: z.number().int().positive().nullable().optional(),
  categoryIds: z.array(z.number().int().positive()).max(100).optional().default([]),
});

export type BookCreateInput = z.infer<typeof bookCreateSchema>;

// Body des Bulk-Delete: nicht-numerische Einträge würden sonst erst bei
// Prisma scheitern (500 statt 400).
export const bookIdsSchema = z
  .array(z.number().int().positive())
  .min(1)
  .max(1000);

const datePrecisionSchema = z.enum(["DAY", "MONTH", "YEAR"]);

export const readingRecordCreateSchema = z.object({
  startedAt: optionalDateString,
  startedAtPrecision: datePrecisionSchema.nullable().optional(),
  readAt: optionalDateString,
  readAtPrecision: datePrecisionSchema.nullable().optional(),
});

export type ReadingRecordCreateInput = z.infer<typeof readingRecordCreateSchema>;
