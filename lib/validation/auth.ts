import { z } from "zod";
import { isWeakPassword } from "./weak-passwords";

// Passwort-Policy nach NIST 800-63B:
// - Mindestlänge 12 (empfohlenes modernes Minimum), Maximallänge 128
//   (verhindert DoS über sehr lange Hash-Eingaben; argon2 verarbeitet den Rest).
// - Keine erzwungenen Komposition-Regeln (Groß/Klein/Sonderzeichen) — NIST rät
//   davon ab, da sie die Entropie kaum erhöhen und die Usability verschlechtern.
// - Abgleich gegen eine Blocklist häufiger/geleakter Passwörter.
const passwordSchema = z
  .string()
  .min(12, "Passwort muss mindestens 12 Zeichen lang sein")
  .max(128, "Passwort darf höchstens 128 Zeichen lang sein")
  .refine((pw) => !isWeakPassword(pw), {
    message: "Passwort ist zu leicht zu erraten. Bitte wähle ein sichereres.",
  });

export const registerSchema = z
  .object({
    email: z.string().email().max(254),
    password: passwordSchema,
    name: z.string().min(1).max(100),
  })
  .superRefine((data, ctx) => {
    // Passwort darf nicht mit der E-Mail (oder deren lokalem Teil) übereinstimmen.
    const pw = data.password.toLowerCase();
    const email = data.email.toLowerCase();
    const localPart = email.split("@")[0];
    if (pw === email || pw === localPart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "Passwort darf nicht deiner E-Mail-Adresse entsprechen.",
      });
    }
  });

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});
