// Basis-URL des Frontends (für Links in Mails). Nutzt den ersten Eintrag aus
// WEB_ORIGINS, sonst den lokalen Dev-Server.
export function webBaseUrl(): string {
  const origins = (process.env.WEB_ORIGINS ?? "http://localhost:3001")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return origins[0] ?? "http://localhost:3001";
}

// Knapp halten: Auf Vercel teilt sich der Versand das Laufzeitbudget der
// Function mit Rate-Limit-Check, Argon2-Hashing und DB-Zugriffen.
const RESEND_TIMEOUT_MS = 5_000;

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type MailResult = "sent" | "not-configured" | "failed";

// Versendet eine Mail über die Resend-HTTP-API (kein SDK). `logTag` kennzeichnet
// die Log-Zeilen. Ohne RESEND_API_KEY bzw. MAIL_FROM wird nichts gesendet und
// "not-configured" geliefert; der Aufrufer entscheidet, ob er einen Ersatz
// (z. B. den Link loggen) anbietet.
export async function sendMail(
  message: MailMessage,
  logTag: string,
): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return "not-configured";

  const from = process.env.MAIL_FROM;
  if (!from) {
    console.error(
      `[${logTag}] RESEND_API_KEY gesetzt, aber MAIL_FROM fehlt — Mailversand nicht möglich.`,
    );
    return "not-configured";
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(
        `[${logTag}] Resend-Versand fehlgeschlagen (Status ${response.status}): ${body.slice(0, 500)}`,
      );
      return "failed";
    }
    return "sent";
  } catch (error) {
    console.error(
      `[${logTag}] Resend-Versand fehlgeschlagen (Netzwerk-/Timeout-Fehler):`,
      error,
    );
    return "failed";
  }
}
