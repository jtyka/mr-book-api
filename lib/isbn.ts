// Reine Funktionen zur ISBN-Prüfung. Keine Abhängigkeiten, keine Seiteneffekte.

// Entfernt Bindestriche und Leerzeichen; "x" wird zu "X".
export function normalizeIsbn(input: string): string {
  return input.replace(/[-\s]/g, "").toUpperCase();
}

function isValidIsbn10(isbn: string): boolean {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const value = isbn[i] === "X" ? 10 : Number(isbn[i]);
    sum += value * (10 - i);
  }
  return sum % 11 === 0;
}

function isbn13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

function isValidIsbn13(isbn: string): boolean {
  if (!/^\d{13}$/.test(isbn)) return false;
  return isbn13CheckDigit(isbn.slice(0, 12)) === Number(isbn[12]);
}

// Rechnet eine ISBN-10 in die ISBN-13 um (Präfix 978, neue Prüfziffer).
function isbn10To13(isbn10: string): string {
  const first12 = `978${isbn10.slice(0, 9)}`;
  return `${first12}${isbn13CheckDigit(first12)}`;
}

// Liefert die normalisierte ISBN-13 oder null, wenn die Eingabe keine gültige
// ISBN-10/-13 ist (Länge, Zeichen oder Prüfziffer falsch).
export function toIsbn13(input: string): string | null {
  const isbn = normalizeIsbn(input);
  if (isbn.length === 13) return isValidIsbn13(isbn) ? isbn : null;
  if (isbn.length === 10) return isValidIsbn10(isbn) ? isbn10To13(isbn) : null;
  return null;
}
