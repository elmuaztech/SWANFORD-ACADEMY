import { PrismaClient } from "@prisma/client";

// Global BigInt JSON serialization patch to prevent TypeError in Next.js APIs
declare global {
  interface BigInt {
    toJSON(): string;
  }
}

if (!("toJSON" in BigInt.prototype)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
}

// Prevent multiple instances of Prisma Client in development hot-reloading.
declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

export default prisma;
