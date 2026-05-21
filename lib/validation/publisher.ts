import { z } from "zod";

export const publisherCreateSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  country: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
});

export type PublisherCreateInput = z.infer<typeof publisherCreateSchema>;
