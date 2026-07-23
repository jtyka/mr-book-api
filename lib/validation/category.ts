import { z } from "zod";

export const categoryCreateSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich").max(100),
  parentId: z.number().int().positive().nullable().optional(),
});

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
