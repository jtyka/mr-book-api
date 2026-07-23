import { z } from "zod";
import { websiteSchema } from "./common";

export const publisherCreateSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich").max(200),
  country: z.string().max(100).nullable().optional(),
  website: websiteSchema,
  address: z.string().max(500).nullable().optional(),
});

export type PublisherCreateInput = z.infer<typeof publisherCreateSchema>;
