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
  const admin = await prisma.user.upsert({
    where: { email: "admin@mr-book.de" },
    update: {},
    create: {
      email: "admin@mr-book.de",
      passwordHash,
      name: "Admin",
    },
  });
  const userId = admin.id;
  console.log("Default user: admin@mr-book.de / admin123");

  // Kategorien (Hierarchie) — gehören dem Default-User
  const prosa = await prisma.category.create({ data: { name: "Prosa", userId } });
  const roman = await prisma.category.create({ data: { name: "Roman", parentId: prosa.id, userId } });
  await prisma.category.createMany({
    data: [
      { name: "Krimi", parentId: roman.id, userId },
      { name: "Fantasy", parentId: roman.id, userId },
      { name: "Science-Fiction", parentId: roman.id, userId },
      { name: "Thriller", parentId: roman.id, userId },
      { name: "Historischer Roman", parentId: roman.id, userId },
      { name: "Liebesroman", parentId: roman.id, userId },
    ],
  });
  await prisma.category.createMany({
    data: [
      { name: "Novelle", parentId: prosa.id, userId },
      { name: "Kurzgeschichte", parentId: prosa.id, userId },
      { name: "Erzählung", parentId: prosa.id, userId },
    ],
  });

  const sachbuch = await prisma.category.create({ data: { name: "Sachbuch", userId } });
  await prisma.category.createMany({
    data: [
      { name: "Geschichte", parentId: sachbuch.id, userId },
      { name: "Ratgeber", parentId: sachbuch.id, userId },
      { name: "Biografie", parentId: sachbuch.id, userId },
      { name: "Wissenschaft", parentId: sachbuch.id, userId },
    ],
  });

  await prisma.category.create({ data: { name: "Lyrik", userId } });
  await prisma.category.create({ data: { name: "Drama", userId } });

  console.log("Seed data created successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
