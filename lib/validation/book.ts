import { z } from "zod";

export const bookCreateSchema = z.object({
  title: z.string().min(1, "Titel ist erforderlich"),
  isbn: z.string().nullable().optional(),
  pageCount: z.number().int().positive().nullable().optional(),
  publishedYear: z.number().int().nullable().optional(),
  language: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  rating: z.number().int().min(1).max(10).nullable().optional(),
  review: z.string().nullable().optional(),
  authorIds: z.array(z.number().int()).optional().default([]),
  publisherId: z.number().int().nullable().optional(),
  categoryId: z.number().int().nullable().optional(),
});

export type BookCreateInput = z.infer<typeof bookCreateSchema>;

export const readingRecordCreateSchema = z.object({
  startedAt: z.string().nullable().optional(),
  readAt: z.string().nullable().optional(),
});

export type ReadingRecordCreateInput = z.infer<typeof readingRecordCreateSchema>;
