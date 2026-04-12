import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Kategorien (Hierarchie)
  const prosa = await prisma.category.create({ data: { name: "Prosa" } });
  const roman = await prisma.category.create({ data: { name: "Roman", parentId: prosa.id } });
  await prisma.category.createMany({
    data: [
      { name: "Krimi", parentId: roman.id },
      { name: "Fantasy", parentId: roman.id },
      { name: "Science-Fiction", parentId: roman.id },
      { name: "Thriller", parentId: roman.id },
      { name: "Historischer Roman", parentId: roman.id },
      { name: "Liebesroman", parentId: roman.id },
    ],
  });
  await prisma.category.createMany({
    data: [
      { name: "Novelle", parentId: prosa.id },
      { name: "Kurzgeschichte", parentId: prosa.id },
      { name: "Erzählung", parentId: prosa.id },
    ],
  });

  const sachbuch = await prisma.category.create({ data: { name: "Sachbuch" } });
  await prisma.category.createMany({
    data: [
      { name: "Geschichte", parentId: sachbuch.id },
      { name: "Ratgeber", parentId: sachbuch.id },
      { name: "Biografie", parentId: sachbuch.id },
      { name: "Wissenschaft", parentId: sachbuch.id },
    ],
  });

  await prisma.category.create({ data: { name: "Lyrik" } });
  await prisma.category.create({ data: { name: "Drama" } });

  console.log("Seed data created successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
