import {
  MAX_DESCRIPTION,
  MAX_LANGUAGE,
  MAX_PUBLISHER,
  MAX_TITLE,
  asRecord,
  cleanAuthorNames,
  cleanPositiveInt,
  cleanText,
  extractYear,
  safeCoverUrl,
  stripHtml,
} from "./sanitize";
import type { SourceBook, SourceResult } from "./types";

// Wandelt die Rohantwort von Google Books in ein SourceBook um (reine Funktion).
// null = kein Treffer.
export function parseGoogleBooks(raw: unknown): SourceBook | null {
  const root = asRecord(raw);
  const items = root?.items;
  if (!Array.isArray(items) || items.length === 0) return null;
  const info = asRecord(asRecord(items[0])?.volumeInfo);
  if (!info) return null;

  const description =
    typeof info.description === "string"
      ? cleanText(stripHtml(info.description), MAX_DESCRIPTION)
      : null;

  return {
    title: cleanText(info.title, MAX_TITLE),
    subtitle: cleanText(info.subtitle, MAX_TITLE),
    authors: Array.isArray(info.authors) ? cleanAuthorNames(info.authors) : [],
    publisher: cleanText(info.publisher, MAX_PUBLISHER),
    publishedYear: extractYear(info.publishedDate),
    pageCount: cleanPositiveInt(info.pageCount),
    language: cleanText(info.language, MAX_LANGUAGE),
    description,
    coverUrl: safeCoverUrl(asRecord(info.imageLinks)?.thumbnail),
  };
}

// Ohne Key wird die Quelle übersprungen (null). Die URL enthält den Key und
// darf deshalb nie geloggt oder in Fehlermeldungen übernommen werden.
export async function fetchGoogleBooks(isbn: string): Promise<SourceResult | null> {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  if (!key) return null;

  const url =
    "https://www.googleapis.com/books/v1/volumes" +
    `?q=isbn:${encodeURIComponent(isbn)}&key=${encodeURIComponent(key)}`;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error(`[ISBN-Lookup] Google Books: HTTP ${response.status}`);
      return { status: "failed" };
    }
    const book = parseGoogleBooks(await response.json());
    return book ? { status: "found", book } : { status: "not-found" };
  } catch (err) {
    // Nur Fehlername, nicht die Meldung (könnte die URL samt Key enthalten).
    console.error(
      `[ISBN-Lookup] Google Books fehlgeschlagen: ${err instanceof Error ? err.name : "unbekannt"}`,
    );
    return { status: "failed" };
  }
}
