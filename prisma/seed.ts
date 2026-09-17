import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as argon2 from "argon2";
import { createDefaultCategories } from "@/lib/default-categories";

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
    update: { role: "ADMIN" },
    create: {
      email: "admin@mr-book.de",
      passwordHash,
      name: "Admin",
      role: "ADMIN",
    },
  });
  const userId = admin.id;
  console.log("Default user: admin@mr-book.de / admin123");

  // Kategorien (Hierarchie) — gehören dem Default-User.
  // PrismaClient erfüllt strukturell das Prisma.TransactionClient-Interface,
  // daher kann createDefaultCategories hier direkt mit `prisma` aufgerufen werden.
  await createDefaultCategories(prisma, userId);

  console.log("Seed data created successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
