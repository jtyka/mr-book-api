import { z } from "zod";

// Änderungen, die ein Admin an einem Nutzerkonto vornehmen darf. Bewusst
// schmal: E-Mail als bestätigt markieren (nur in diese Richtung) und
// sperren/entsperren. Kein Bearbeiten von Name/E-Mail, keine Rollenvergabe.
export const adminUserUpdateSchema = z
  .object({
    emailVerified: z.literal(true).optional(),
    disabled: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.emailVerified !== undefined || v.disabled !== undefined, {
    message: "Keine Änderung angegeben",
  });
