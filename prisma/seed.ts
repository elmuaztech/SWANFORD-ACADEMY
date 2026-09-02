import { PrismaClient } from "@prisma/client";
import { seedProductionFoundation } from "./seeds/production";
import { seedDevelopmentMocks } from "./seeds/development";

const prisma = new PrismaClient();

async function main() {
  const isProduction = process.env.NODE_ENV === "production";
  const shouldSeedMocks = process.env.SEED_MOCKS === "true" || process.argv.includes("--mocks");

  console.log("=================================================");
  console.log("Swanford Academy Database Seeder");
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log("=================================================");

  // 1. Always seed clean production architectural foundation
  await seedProductionFoundation(prisma);

  // 2. Conditionally seed developer demonstration mocks ONLY if explicitly requested and NOT in production
  if (!isProduction && shouldSeedMocks) {
    await seedDevelopmentMocks(prisma);
  } else if (isProduction) {
    console.log("🔒 Production Mode Verified: Zero mock students, parents, invoices, or revenue seeded.");
  } else {
    console.log("ℹ Clean Dev Baseline: Mock records skipped (run with --mocks or SEED_MOCKS=true to include).");
  }
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
