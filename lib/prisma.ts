import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeonHttp } from "@prisma/adapter-neon";

function createPrismaClient() {
  const url = process.env.DATABASE_URL!;
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    const adapter = new PrismaPg(url);
    return new PrismaClient({ adapter });
  }
  const adapter = new PrismaNeonHttp(url, {
    arrayMode: false,
    fullResults: true,
  });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
