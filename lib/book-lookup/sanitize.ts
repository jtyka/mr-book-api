// Hilfsfunktionen für Daten aus fremden Katalogen (nicht vertrauenswürdig).

// Längen angelehnt an lib/validation/book.ts
export const MAX_TITLE = 500;
export const MAX_DESCRIPTION = 10000;
export const MAX_LANGUAGE = 50;
export const MAX_PUBLISHER = 200;
export const MAX_AUTHOR_NAME = 200;
export const MAX_AUTHORS = 20;

const ALLOWED_COVER_HOSTS = new Set(["books.google.com", "covers.openlibrary.org"]);

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

// Getrimmter, auf maxLength gekürzter Text oder null (kein String / leer).
export function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength).trim() : null;
}

export function cleanPositiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value < 100000
    ? value
    : null;
}

// Entfernt HTML-Tags und dekodiert die häufigsten Entities.
export function stripHtml(value: string): string {
  return value
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Erste vierstellige Jahreszahl im Freitext ("1975", "Feb 24, 2008", "2019-03-01").
export function extractYear(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/(?<!\d)\d{4}(?!\d)/);
  return match ? Number(match[0]) : null;
}

// Nur https und nur erlaubte Hosts; http:// wird auf https umgeschrieben.
export function safeCoverUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!ALLOWED_COVER_HOSTS.has(url.hostname)) return null;
  if (url.port || url.username || url.password) return null;
  url.protocol = "https:";
  return url.toString();
}

// Autorennamen aus einer Liste von Strings; höchstens MAX_AUTHORS, ohne Duplikate.
export function cleanAuthorNames(names: unknown[]): string[] {
  const result: string[] = [];
  for (const name of names) {
    const clean = cleanText(name, MAX_AUTHOR_NAME);
    if (clean && !result.includes(clean)) result.push(clean);
    if (result.length >= MAX_AUTHORS) break;
  }
  return result;
}
