import { z } from "zod";

export const authorCreateSchema = z.object({
  firstName: z.string().min(1, "Vorname ist erforderlich"),
  lastName: z.string().min(1, "Nachname ist erforderlich"),
  birthDate: z.string().nullable().optional(),
  nationality: z.string().nullable().optional(),
  email: z.string().email("Ungültige E-Mail-Adresse").nullable().optional(),
});

export type AuthorCreateInput = z.infer<typeof authorCreateSchema>;
