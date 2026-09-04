import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

/**
 * Swanford Academy — Concurrency-Safe Application Number Generator
 * Master Specification Reference: Sections 8, 10, 21
 *
 * Invariants:
 * - Format: APP-YYYY-NNNN (e.g. APP-2026-0001)
 * - Globally unique, generated server-side, permanent
 * - Never uses COUNT(*) + 1 (strictly concurrency-safe via atomic sequences)
 * - Numbers are never reused or backfilled
 * - Completely separate namespace from student admission numbers (SA-YYYY-NNNN)
 */

export type PrismaTx = Prisma.TransactionClient;

/**
 * Formats a sequential integer into the canonical application number: APP-YYYY-NNNN
 * e.g., year=2026, sequence=42 -> "APP-2026-0042"
 */
export function formatApplicationNumber(year: number, sequence: number): string {
  const padded = sequence.toString().padStart(4, '0');
  return `APP-${year}-${padded}`;
}

/**
 * Generates the next sequential application number for a given calendar year.
 * Atomically increments the sequence counter in PostgreSQL.
 */
export async function generateNextApplicationNumber(
  year: number = new Date().getFullYear(),
  client: PrismaTx | typeof prisma = prisma
): Promise<string> {
  const block = await reserveApplicationNumberBlock(1, year, client);
  return block[0];
}

/**
 * Atomically reserves a block of sequential numbers for application creation.
 * Guarantees zero collision risk even with concurrent applicants submitting simultaneously.
 */
export async function reserveApplicationNumberBlock(
  count: number,
  year: number = new Date().getFullYear(),
  client: PrismaTx | typeof prisma = prisma
): Promise<string[]> {
  if (count <= 0) {
    return [];
  }

  // Ensure sequence row is initialized for this year if not already present
  const existingSeq = await client.applicationNumberSequence.findUnique({
    where: { year },
  });

  if (!existingSeq) {
    // Determine the highest existing sequence number for this year among applications
    const highestApp = await client.application.findFirst({
      where: { applicationNumber: { startsWith: `APP-${year}-` } },
      orderBy: { applicationNumber: 'desc' },
      select: { applicationNumber: true },
    });

    let initialLastSeq = 0;
    if (highestApp) {
      const match = highestApp.applicationNumber.match(/APP-\d{4}-(\d+)/);
      if (match) {
        initialLastSeq = parseInt(match[1], 10);
      }
    }

    // Upsert the baseline if not concurrently created
    await client.$queryRaw`
      INSERT INTO application_number_sequences ("year", "last_sequence", "updated_at")
      VALUES (${year}, ${initialLastSeq}, NOW())
      ON CONFLICT ("year") DO NOTHING;
    `;
  }

  // Atomically increment the sequence counter and return the new last_sequence
  const result = await client.$queryRaw<{ last_sequence: number }[]>(
    Prisma.sql`
      UPDATE application_number_sequences
      SET "last_sequence" = application_number_sequences."last_sequence" + ${count},
          "updated_at" = NOW()
      WHERE "year" = ${year}
      RETURNING "last_sequence";
    `
  );

  const endSeq = result[0].last_sequence;
  const startSeq = endSeq - count + 1;

  const applicationNumbers: string[] = [];
  for (let seq = startSeq; seq <= endSeq; seq++) {
    applicationNumbers.push(formatApplicationNumber(year, seq));
  }

  return applicationNumbers;
}
