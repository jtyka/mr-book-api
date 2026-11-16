import { fetchGoogleBooks } from "./google";
import { fetchOpenLibrary, fetchOpenLibraryLanguage } from "./openlibrary";
import { MAX_AUTHORS, MAX_TITLE } from "./sanitize";
import type { LookupResult, LookupSource, SourceBook, SourceResult } from "./types";

export type { LookupResult } from "./types";

// Vorrang bei der Zusammenführung: frühere Quellen gewinnen je Feld.
// (Google vor Open Library ist eine Annahme, siehe SPEC Abschnitt 10.)
export const SOURCE_PRIORITY: LookupSource[] = ["google", "openlibrary"];

// Nur für das Feld coverUrl: Open Library vor Google, weil deren Cover größer
// sind (SPEC Cover-Bilder, Abschnitt 3).
export const COVER_PRIORITY: LookupSource[] = ["openlibrary", "google"];

function titleOf(book: SourceBook): string | null {
  if (!book.title) return null;
  if (!book.subtitle) return book.title;
  // Endet der Titel schon mit einem Satzzeichen ("Wer bin ich?"), kein
  // zusätzlicher Punkt.
  const separator = /[.!?:…]$/.test(book.title) ? " " : ". ";
  return `${book.title}${separator}${book.subtitle}`.slice(0, MAX_TITLE);
}

// Führt die Treffer je Feld zusammen (reine Funktion). Liefert null, wenn keine
// Quelle einen Treffer hat. `sources` enthält nur Quellen, die tatsächlich
// einen Wert beigetragen haben.
export function mergeSources(
  isbn: string,
  found: Partial<Record<LookupSource, SourceBook>>,
): LookupResult | null {
  const ordered = SOURCE_PRIORITY.flatMap((s) => (found[s] ? [{ source: s, book: found[s]! }] : []));
  if (ordered.length === 0) return null;

  const used = new Set<LookupSource>();
  function pick<T>(
    get: (book: SourceBook) => T | null,
    empty: (v: T) => boolean = () => false,
    candidates = ordered,
  ): T | null {
    for (const { source, book } of candidates) {
      const value = get(book);
      if (value !== null && !empty(value)) {
        used.add(source);
        return value;
      }
    }
    return null;
  }

  const title = pick(titleOf);
  const authors = pick((b) => b.authors, (a) => a.length === 0) ?? [];
  const publisher = pick((b) => b.publisher);
  const publishedYear = pick((b) => b.publishedYear);
  const pageCount = pick((b) => b.pageCount);
  const language = pick((b) => b.language);
  const description = pick((b) => b.description);
  const coverOrdered = COVER_PRIORITY.flatMap((s) => (found[s] ? [{ source: s, book: found[s]! }] : []));
  const coverUrl = pick((b) => b.coverUrl, () => false, coverOrdered);

  // Katalogeintrag ohne ein einziges verwertbares Feld zählt als kein Treffer.
  if (used.size === 0) return null;

  return {
    isbn,
    sources: SOURCE_PRIORITY.filter((s) => used.has(s)),
    title: title ?? "",
    authors: authors.slice(0, MAX_AUTHORS),
    publisher,
    publishedYear,
    pageCount,
    language,
    description,
    coverUrl,
  };
}

export type LookupOutcome =
  | { kind: "found"; result: LookupResult }
  | { kind: "not-found" }
  | { kind: "unavailable" };

// Fragt beide Quellen parallel ab. "not-found" nur, wenn alle aktiven Quellen
// geantwortet haben und keine einen Treffer kennt. Ist eine Quelle ausgefallen
// und die übrigen kennen die ISBN nicht, ist das kein belastbares "nicht
// gefunden" -> "unavailable" (der Nutzer soll es später erneut versuchen).
export async function lookupIsbn(isbn: string): Promise<LookupOutcome> {
  const [google, openlibrary] = await Promise.all([
    fetchGoogleBooks(isbn),
    fetchOpenLibrary(isbn),
  ]);

  const results: SourceResult[] = [google, openlibrary].filter(
    (r): r is SourceResult => r !== null,
  );
  const anyFailed = results.some((r) => r.status === "failed");
  if (results.every((r) => r.status === "failed")) return { kind: "unavailable" };

  const found: Partial<Record<LookupSource, SourceBook>> = {};
  if (google?.status === "found") found.google = google.book;
  if (openlibrary.status === "found") found.openlibrary = openlibrary.book;

  // Sprache nur nachladen, wenn Google keine liefert und Open Library trifft.
  if (found.openlibrary && !found.google?.language) {
    found.openlibrary = {
      ...found.openlibrary,
      language: await fetchOpenLibraryLanguage(isbn),
    };
  }

  const result = mergeSources(isbn, found);
  if (result) return { kind: "found", result };
  return anyFailed ? { kind: "unavailable" } : { kind: "not-found" };
}

// Ermittelt nur die Cover-Adresse (für die Sammelaktion): Open Library zuerst,
// Google nur, wenn Open Library keins hat (schont das Google-Kontingent).
// Fehler und fehlende Treffer ergeben null.
export async function lookupCoverUrl(isbn: string): Promise<string | null> {
  for (const source of COVER_PRIORITY) {
    const result = source === "openlibrary" ? await fetchOpenLibrary(isbn) : await fetchGoogleBooks(isbn);
    if (result?.status === "found" && result.book.coverUrl) return result.book.coverUrl;
  }
  return null;
}
