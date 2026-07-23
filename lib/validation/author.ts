import { z } from "zod";
import { optionalDateString, websiteSchema } from "./common";

export const authorCreateSchema = z.object({
  firstName: z.string().min(1, "Vorname ist erforderlich").max(100),
  lastName: z.string().min(1, "Nachname ist erforderlich").max(100),
  birthDate: optionalDateString,
  nationality: z.string().max(100).nullable().optional(),
  email: z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().email("Ungültige E-Mail-Adresse").max(254).nullable().optional()
  ),
  website: websiteSchema,
});

export type AuthorCreateInput = z.infer<typeof authorCreateSchema>;
