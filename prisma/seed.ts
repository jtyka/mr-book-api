import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as argon2 from "argon2";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Default-User
  const passwordHash = await argon2.hash("admin123", {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
  await prisma.user.upsert({
    where: { email: "admin@mr-book.de" },
    update: {},
    create: {
      email: "admin@mr-book.de",
      passwordHash,
      name: "Admin",
    },
  });
  console.log("Default user: admin@mr-book.de / admin123");

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
