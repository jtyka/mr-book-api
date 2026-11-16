import { del, put } from "@vercel/blob";

// Speicher für Cover-Bilder (Vercel Blob, öffentlicher Store). Lokal ohne
// BLOB_READ_WRITE_TOKEN ist der Speicher nicht eingerichtet; die Cover-
// Endpunkte antworten dann mit 503.

export const MAX_COVER_BYTES = 1024 * 1024; // 1 MB

export type CoverImageType = "jpeg" | "png" | "webp";

const CONTENT_TYPES: Record<CoverImageType, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const EXTENSIONS: Record<CoverImageType, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
};

export function isCoverStoreConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

// Erkennt den Bildtyp an den ersten Bytes (nicht an Dateiname oder Header).
// Nur JPEG, PNG und WebP; kein SVG, kein GIF. Reine Funktion.
export function detectImageType(bytes: Uint8Array): CoverImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "png";
  // WebP: "RIFF" <4 Byte Länge> "WEBP"
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

// Speichert das Bild und gibt die öffentliche URL zurück. Wirft bei Fehlern.
// Der Zufallsteil im Pfad macht die Adresse nicht erratbar.
export async function saveCover(
  userId: number,
  bookId: number,
  bytes: Uint8Array,
  type: CoverImageType,
): Promise<string> {
  const pathname = `covers/u${userId}/b${bookId}-${crypto.randomUUID()}.${EXTENSIONS[type]}`;
  const blob = await put(pathname, Buffer.from(bytes), {
    access: "public",
    addRandomSuffix: false,
    contentType: CONTENT_TYPES[type],
  });
  return blob.url;
}

// Gehört die Adresse zum eigenen Blob-Store (https, *.public.blob.vercel-storage.com,
// Pfad unter covers/)? Nur solche URLs werden je an del() gegeben.
export function isOwnCoverUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.hostname.endsWith(".public.blob.vercel-storage.com") &&
    url.pathname.startsWith("/covers/")
  );
}

// Best-Effort: Fehler werden geloggt, nie geworfen (übrig bleibt höchstens
// eine verwaiste Datei).
export async function deleteCovers(urls: (string | null | undefined)[]): Promise<void> {
  const own = urls.filter(isOwnCoverUrl);
  if (own.length === 0 || !isCoverStoreConfigured()) return;
  try {
    await del(own);
  } catch (err) {
    console.error(
      `[Cover] Löschen fehlgeschlagen: ${err instanceof Error ? err.name : "unbekannt"}`,
    );
  }
}

export function deleteCover(url: string | null | undefined): Promise<void> {
  return deleteCovers([url]);
}
