type PrismaClientLike = {
  [key: string]: unknown;
};

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClientLike };

function createPrismaClient(): PrismaClientLike {
  try {
    const pkg = require("@prisma/client") as { PrismaClient?: new (...args: any[]) => PrismaClientLike };
    if (!pkg.PrismaClient) throw new Error("PrismaClient is not available. Run `pnpm prisma:generate`.");
    return new pkg.PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"]
    });
  } catch (error) {
    throw new Error(
      "Prisma client is not ready. Install dependencies and run `pnpm prisma:generate` before using Prisma routes."
    );
  }
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
