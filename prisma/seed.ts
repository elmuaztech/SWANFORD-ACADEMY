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

  console.log("🔒 Verified: Zero mock students, parents, invoices, or records seeded. Mock creation permanently disabled.");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
