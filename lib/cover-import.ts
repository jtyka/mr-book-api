import { MAX_COVER_BYTES, detectImageType, type CoverImageType } from "./cover-store";
import { safeCoverUrl } from "./book-lookup/sanitize";

// Sicherer Abruf eines Cover-Bildes von einer Fremdquelle.

const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;
// Antworten unter dieser Größe sind Platzhalter (z. B. 1x1-GIF von Open Library).
const MIN_COVER_BYTES = 1000;

// Erlaubte Hosts für Anfrage und jedes Weiterleitungsziel. Open Library leitet
// ISBN-Adressen auf archive.org und von dort auf iaNNNNNN.us.archive.org weiter
// (am 16.11.2026 beobachtet); ID-Adressen kommen direkt von covers.openlibrary.org.
const ALLOWED_HOSTS = new Set(["books.google.com", "covers.openlibrary.org", "archive.org"]);
const ALLOWED_HOST_SUFFIXES = [".archive.org"];

function isAllowedHost(hostname: string): boolean {
  return ALLOWED_HOSTS.has(hostname) || ALLOWED_HOST_SUFFIXES.some((s) => hostname.endsWith(s));
}

function isAllowedTarget(url: URL): boolean {
  return url.protocol === "https:" && !url.port && !url.username && !url.password && isAllowedHost(url.hostname);
}

export type CoverFetchResult =
  | { kind: "found"; bytes: Uint8Array; type: CoverImageType }
  | { kind: "none" } // Quelle kennt kein (brauchbares) Cover
  | { kind: "unavailable" }; // Quelle nicht erreichbar oder verhält sich unzulässig

// Liest den Body höchstens bis MAX_COVER_BYTES; null bei Überschreitung.
async function readLimited(response: Response): Promise<Uint8Array | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_COVER_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

// Ruft die Adresse ab. Der Aufrufer prüft sie vorab mit safeCoverUrl; hier wird
// sie zur Sicherheit erneut geprüft.
export async function fetchCoverImage(sourceUrl: string): Promise<CoverFetchResult> {
  const first = safeCoverUrl(sourceUrl);
  if (!first) return { kind: "unavailable" };

  try {
    const signal = AbortSignal.timeout(TIMEOUT_MS); // gilt für den gesamten Abruf
    let current = new URL(first);

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!isAllowedTarget(current)) return { kind: "unavailable" };

      const response = await fetch(current, {
        headers: { "User-Agent": "mr-book/1.0 (Cover-Import)", Accept: "image/*" },
        redirect: "manual",
        signal,
        cache: "no-store",
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel().catch(() => {});
        const location = response.headers.get("location");
        if (!location) return { kind: "unavailable" };
        try {
          current = new URL(location, current);
        } catch {
          return { kind: "unavailable" };
        }
        continue;
      }

      if (response.status === 404 || response.status === 410) {
        await response.body?.cancel().catch(() => {});
        return { kind: "none" };
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        return { kind: "unavailable" };
      }

      const length = Number(response.headers.get("content-length"));
      if (Number.isFinite(length) && length > MAX_COVER_BYTES) {
        await response.body?.cancel().catch(() => {});
        return { kind: "none" };
      }
      const bytes = await readLimited(response);
      if (!bytes || bytes.length < MIN_COVER_BYTES) return { kind: "none" };
      const type = detectImageType(bytes);
      return type ? { kind: "found", bytes, type } : { kind: "none" };
    }
    return { kind: "unavailable" }; // zu viele Weiterleitungen
  } catch (err) {
    console.error(
      `[Cover-Import] Abruf fehlgeschlagen: ${err instanceof Error ? err.name : "unbekannt"}`,
    );
    return { kind: "unavailable" };
  }
}
