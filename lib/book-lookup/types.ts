export type LookupSource = "google" | "openlibrary";

// Rohdaten einer Quelle, bereits typgeprüft und gekürzt, aber noch nicht
// zusammengeführt. Fehlende Werte sind null bzw. [].
export interface SourceBook {
  title: string | null;
  subtitle: string | null;
  authors: string[];
  publisher: string | null;
  publishedYear: number | null;
  pageCount: number | null;
  language: string | null;
  description: string | null;
  coverUrl: string | null;
}

// "found": Quelle hat geantwortet und kennt die ISBN; "not-found": Quelle hat
// geantwortet, kennt sie aber nicht; "failed": Netzfehler, Timeout, Nicht-2xx
// oder kaputtes JSON.
export type SourceResult =
  | { status: "found"; book: SourceBook }
  | { status: "not-found" }
  | { status: "failed" };

export interface LookupResult {
  isbn: string;
  sources: LookupSource[];
  title: string;
  authors: string[];
  publisher: string | null;
  publishedYear: number | null;
  pageCount: number | null;
  language: string | null;
  description: string | null;
  coverUrl: string | null;
}
