// Parst den JSON-Body einer Request fehlertolerant. Ein leerer oder kaputter
// Body würde bei `request.json()` eine ungefangene Exception werfen (→ 500).
// Hier wird stattdessen `null` zurückgegeben, das anschließend ganz normal an
// die jeweilige Zod-Validierung durchgereicht werden kann — die liefert dann
// den gewohnten 400er im Fehlerformat der Route.
export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
