import { z } from "zod";

export const categoryCreateSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  parentId: z.number().int().nullable().optional(),
});

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
