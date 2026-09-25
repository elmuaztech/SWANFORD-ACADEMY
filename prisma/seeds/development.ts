import { PrismaClient } from "@prisma/client";

/**
 * Swanford Academy - Development Mock Seed Disabled
 *
 * Per administrator directive, mock data generation is PERMANENTLY DISABLED.
 * This function is an intentional no-op to ensure no synthetic students,
 * parents, guardians, invoices, or transactions are ever inserted.
 */
export async function seedDevelopmentMocks(_prisma: PrismaClient) {
  console.log("🔒 Mock data creation is permanently disabled. No mock records will be created.");
}
