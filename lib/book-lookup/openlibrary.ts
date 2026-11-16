import {
  MAX_PUBLISHER,
  MAX_TITLE,
  asRecord,
  cleanAuthorNames,
  cleanPositiveInt,
  cleanText,
  extractYear,
  safeCoverUrl,
} from "./sanitize";
import type { SourceBook, SourceResult } from "./types";

const USER_AGENT = "mr-book/1.0 (ISBN-Lookup)";

// Open-Library-Sprachcodes (ISO 639-2/B) -> zweistellige Codes.
const LANGUAGE_CODES: Record<string, string> = {
  ger: "de",
  eng: "en",
  fre: "fr",
  spa: "es",
  ita: "it",
  por: "pt",
  dut: "nl",
  swe: "sv",
  dan: "da",
  nor: "no",
  fin: "fi",
  pol: "pl",
  rus: "ru",
  cze: "cs",
  hun: "hu",
  tur: "tr",
  gre: "el",
  lat: "la",
  jpn: "ja",
  chi: "zh",
  kor: "ko",
  ara: "ar",
  heb: "he",
};

// Wandelt die Antwort von /api/books (jscmd=data) in ein SourceBook um.
// null = kein Treffer (leeres Objekt bzw. Schlüssel fehlt).
export function parseOpenLibraryBooks(raw: unknown, isbn: string): SourceBook | null {
  const entry = asRecord(asRecord(raw)?.[`ISBN:${isbn}`]);
  if (!entry) return null;

  const names = (value: unknown): unknown[] =>
    Array.isArray(value) ? value.map((v) => asRecord(v)?.name) : [];
  const publishers = names(entry.publishers);

  return {
    title: cleanText(entry.title, MAX_TITLE),
    subtitle: cleanText(entry.subtitle, MAX_TITLE),
    authors: cleanAuthorNames(names(entry.authors)),
    publisher: publishers.map((p) => cleanText(p, MAX_PUBLISHER)).find((p) => p !== null) ?? null,
    publishedYear: extractYear(entry.publish_date),
    pageCount: cleanPositiveInt(entry.number_of_pages),
    language: null,
    description: null, // Beschreibung nur von Google
    coverUrl: safeCoverUrl(asRecord(entry.cover)?.large),
  };
}

// Liest aus /isbn/<isbn>.json das erste bekannte Sprachkürzel (z. B.
// "/languages/ger" -> "de"); unbekannt -> null.
export function parseOpenLibraryLanguage(raw: unknown): string | null {
  const languages = asRecord(raw)?.languages;
  if (!Array.isArray(languages)) return null;
  for (const lang of languages) {
    const key = asRecord(lang)?.key;
    if (typeof key !== "string") continue;
    const code = LANGUAGE_CODES[key.replace(/^\/languages\//, "")];
    if (code) return code;
  }
  return null;
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function fetchOpenLibrary(isbn: string): Promise<SourceResult> {
  try {
    const raw = await getJson(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`,
    );
    const book = parseOpenLibraryBooks(raw, isbn);
    return book ? { status: "found", book } : { status: "not-found" };
  } catch (err) {
    console.error(
      `[ISBN-Lookup] Open Library fehlgeschlagen: ${err instanceof Error ? err.message : "unbekannt"}`,
    );
    return { status: "failed" };
  }
}

// Zweiter Aufruf nur für die Sprache; Fehler sind hier unkritisch (-> null).
export async function fetchOpenLibraryLanguage(isbn: string): Promise<string | null> {
  try {
    return parseOpenLibraryLanguage(
      await getJson(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`),
    );
  } catch {
    return null;
  }
}
