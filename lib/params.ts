// Wandelt einen Pfad-Parameter in eine positive Ganzzahl um. Gibt bei
// ungültigen Werten null zurück — Number("abc") wäre NaN, was Prisma mit
// einem Validierungsfehler (500) quittieren würde statt mit 400/404.
export function parseId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
