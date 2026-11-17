import { z } from "zod";
import { isWeakPassword } from "./weak-passwords";

// Passwort-Policy nach NIST 800-63B:
// - Mindestlänge 12 (empfohlenes modernes Minimum), Maximallänge 128
//   (verhindert DoS über sehr lange Hash-Eingaben; argon2 verarbeitet den Rest).
// - Keine erzwungenen Komposition-Regeln (Groß/Klein/Sonderzeichen) — NIST rät
//   davon ab, da sie die Entropie kaum erhöhen und die Usability verschlechtern.
// - Abgleich gegen eine Blocklist häufiger/geleakter Passwörter.
export const passwordSchema = z
  .string()
  .min(12, "Passwort muss mindestens 12 Zeichen lang sein")
  .max(128, "Passwort darf höchstens 128 Zeichen lang sein")
  .refine((pw) => !isWeakPassword(pw), {
    message: "Passwort ist zu leicht zu erraten. Bitte wähle ein sichereres.",
  });

// Passwort darf nicht mit der E-Mail (oder deren lokalem Teil) übereinstimmen.
export function passwordMatchesEmail(password: string, email: string): boolean {
  const pw = password.toLowerCase();
  const mail = email.toLowerCase();
  return pw === mail || pw === mail.split("@")[0];
}

export const PASSWORD_EQUALS_EMAIL_MESSAGE =
  "Passwort darf nicht deiner E-Mail-Adresse entsprechen.";

export const registerSchema = z
  .object({
    email: z.string().email().max(254),
    password: passwordSchema,
    name: z.string().min(1).max(100),
  })
  .superRefine((data, ctx) => {
    if (passwordMatchesEmail(data.password, data.email)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: PASSWORD_EQUALS_EMAIL_MESSAGE,
      });
    }
  });

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().default(false),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const resendVerificationSchema = z.object({
  email: z.string().email().max(254),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(254),
});

export const resetTokenSchema = z.object({
  token: z.string().min(1).max(200),
});

// Das Passwort wird in der Route geprüft (passwordSchema, nicht gegen die E-Mail
// des Kontos), damit ein zu schwaches Passwort den Token nicht verbraucht.
export const resetPasswordSchema = resetTokenSchema.extend({
  password: z.string().max(1000),
});
