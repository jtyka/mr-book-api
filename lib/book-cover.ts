import { prisma } from "./prisma";
import { bookInclude } from "./book-format";
import { deleteCover, saveCover, type CoverImageType } from "./cover-store";

// Speichert ein Cover für ein (bereits als eigen geprüftes) Buch: erst Datei,
// dann Datenbank, dann die alte Datei löschen (Best-Effort). Schlägt die
// Datenbank fehl, wird die neue Datei wieder entfernt. Wirft bei Fehlern.
// Mit onlyIfEmpty wird ein vorhandenes Cover nie überschrieben; Ergebnis dann
// null, wenn inzwischen eines gesetzt wurde.
export async function replaceBookCover(
  userId: number,
  book: { id: number; coverUrl: string | null },
  bytes: Uint8Array,
  type: CoverImageType,
  options: { onlyIfEmpty?: boolean } = {},
) {
  const newUrl = await saveCover(userId, book.id, bytes, type);
  try {
    if (options.onlyIfEmpty) {
      const { count } = await prisma.book.updateMany({
        where: { id: book.id, userId, coverUrl: null },
        data: { coverUrl: newUrl },
      });
      if (count === 0) {
        await deleteCover(newUrl);
        return null;
      }
    } else {
      await prisma.book.update({ where: { id: book.id }, data: { coverUrl: newUrl } });
    }
  } catch (err) {
    await deleteCover(newUrl);
    throw err;
  }
  if (!options.onlyIfEmpty) await deleteCover(book.coverUrl);
  return prisma.book.findFirst({ where: { id: book.id, userId }, include: bookInclude });
}
