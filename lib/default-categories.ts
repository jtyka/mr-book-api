import type { Prisma } from "@prisma/client";

// Verschachtelte Baum-Definition für den Standard-Kategorienbaum, der jedem
// neuen User bei der Registrierung angelegt wird (Mandantentrennung per userId).
// Der Baum kann danach frei erweitert oder gelöscht werden.
export interface DefaultCategoryNode {
  name: string;
  children?: DefaultCategoryNode[];
}

export const DEFAULT_CATEGORY_TREE: DefaultCategoryNode[] = [
  {
    name: "Prosa",
    children: [
      {
        name: "Roman",
        children: [
          { name: "Krimi" },
          { name: "Fantasy" },
          { name: "Science-Fiction" },
          { name: "Thriller" },
          { name: "Historischer Roman" },
          { name: "Liebesroman" },
          { name: "Horror" },
          { name: "Dark Fantasy" },
          { name: "Bildungsroman" },
          { name: "Schelmenroman" },
          { name: "Satire" },
        ],
      },
      { name: "Novelle" },
      { name: "Kurzgeschichte" },
      { name: "Erzählung" },
    ],
  },
  {
    name: "Sachbuch",
    children: [
      { name: "Geschichte" },
      { name: "Ratgeber" },
      { name: "Biografie" },
      { name: "Wissenschaft" },
    ],
  },
  { name: "Lyrik" },
  { name: "Drama" },
];

// Ein Knoten der aktuell zu erzeugenden Ebene, zusammen mit der (bereits
// bekannten) ID seines Elternknotens.
interface PendingNode {
  node: DefaultCategoryNode;
  parentId: number | null;
}

// Legt den Standard-Kategorienbaum ebenenweise (Breadth-First) für den
// übergebenen User an. `tx` ist bewusst weit gefasst (Prisma.TransactionClient
// oder der vollwertige PrismaClient, z. B. im Seed-Skript), da beide
// strukturell dieselbe `category`-API besitzen.
//
// Statt pro Knoten einen eigenen `create`-Roundtrip zu machen (23 serielle
// Roundtrips würden in einer interaktiven Transaktion auf Vercel/Neon das
// Prisma-Standard-Timeout von 5 s reißen können), wird pro Baumebene ein
// einziges `createManyAndReturn` ausgeführt — bei unserem Baum also 3
// Roundtrips statt 23.
export async function createDefaultCategories(
  tx: Prisma.TransactionClient,
  userId: number,
  tree: DefaultCategoryNode[] = DEFAULT_CATEGORY_TREE,
): Promise<void> {
  let currentLevel: PendingNode[] = tree.map((node) => ({ node, parentId: null }));

  while (currentLevel.length > 0) {
    const created = await tx.category.createManyAndReturn({
      data: currentLevel.map(({ node, parentId }) => ({
        name: node.name,
        parentId,
        userId,
      })),
      select: { id: true, name: true, parentId: true },
    });

    // `createManyAndReturn` garantiert keine bestimmte Reihenfolge der
    // Ergebniszeilen, daher über (parentId, name) den erzeugten IDs
    // zuordnen statt über den Index.
    const idByKey = new Map<string, number>();
    for (const row of created) {
      idByKey.set(`${row.parentId ?? "root"}:${row.name}`, row.id);
    }

    const nextLevel: PendingNode[] = [];
    for (const { node, parentId } of currentLevel) {
      const id = idByKey.get(`${parentId ?? "root"}:${node.name}`);
      if (id === undefined) {
        throw new Error(
          `Kategorie "${node.name}" konnte nach dem Anlegen nicht zugeordnet werden.`,
        );
      }
      for (const child of node.children ?? []) {
        nextLevel.push({ node: child, parentId: id });
      }
    }
    currentLevel = nextLevel;
  }
}
