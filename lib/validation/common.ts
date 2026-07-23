import { z } from "zod";

// Nur echte http(s)-URLs zulassen — verhindert u. a. javascript:-URLs, die im
// Frontend als Link gerendert würden.
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export const websiteSchema = z.preprocess(
  (v) => (v === "" ? null : v),
  z
    .string()
    .max(500)
    .refine(isHttpUrl, "Bitte eine vollständige http(s)-URL angeben")
    .nullable()
    .optional(),
);

// Optionaler Datums-String; ungültige Werte würden sonst als Invalid Date bei
// Prisma landen und einen 500er auslösen.
export const optionalDateString = z.preprocess(
  (v) => (v === "" ? null : v),
  z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "Ungültiges Datum")
    .nullable()
    .optional(),
);
