import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

/**
 * Swanford Academy — Concurrency-Safe Admission Number Generator
 *
 * Requirements:
 * - Format: SA-YYYY-NNNN (e.g. SA-2026-0001)
 * - Globally unique, generated server-side, permanent
 * - Never uses COUNT(*) + 1 (strictly concurrency-safe)
 * - Numbers are never reused or backfilled
 * - Gaps are permitted if reserved numbers are unused
 */

export type PrismaTx = Prisma.TransactionClient;

/**
 * Formats a sequential integer into the canonical admission number: SA-YYYY-NNNN
 * e.g., year=2026, sequence=42 -> "SA-2026-0042"
 */
export function formatAdmissionNumber(year: number, sequence: number): string {
  const padded = sequence.toString().padStart(4, '0');
  return `SA-${year}-${padded}`;
}

/**
 * Generates the next sequential admission number for a given calendar year.
 * Atomically increments the sequence counter in PostgreSQL.
 */
export async function generateNextAdmissionNumber(
  year: number = new Date().getFullYear(),
  client: PrismaTx | typeof prisma = prisma
): Promise<string> {
  const block = await reserveAdmissionNumberBlock(1, year, client);
  return block[0];
}

/**
 * Atomically reserves a block of sequential numbers for bulk student creation.
 * If 40 numbers are requested, this performs an atomic sequence update in
 * PostgreSQL, ensuring zero collision risk even with concurrent administrators.
 *
 * Gaps Invariant:
 * Any reserved numbers that are discarded due to row validation failures remain
 * as permanent unassigned gaps. They are never recycled.
 */
export async function reserveAdmissionNumberBlock(
  count: number,
  year: number = new Date().getFullYear(),
  client: PrismaTx | typeof prisma = prisma
): Promise<string[]> {
  if (count <= 0) {
    return [];
  }

  // Ensure sequence row is initialized for this year if not already present
  const existingSeq = await client.admissionNumberSequence.findUnique({
    where: { year },
  });

  if (!existingSeq) {
    // Determine the highest existing sequence number for this year among existing students
    const highestStudent = await client.student.findFirst({
      where: { admissionNumber: { startsWith: `SA-${year}-` } },
      orderBy: { admissionNumber: 'desc' },
      select: { admissionNumber: true },
    });

    let initialLastSeq = 0;
    if (highestStudent) {
      const match = highestStudent.admissionNumber.match(/SA-\d{4}-(\d+)/);
      if (match) {
        initialLastSeq = parseInt(match[1], 10);
      }
    }

    // Upsert the baseline if not concurrently created
    await client.$queryRaw`
      INSERT INTO admission_number_sequences ("year", "last_sequence", "updated_at")
      VALUES (${year}, ${initialLastSeq}, NOW())
      ON CONFLICT ("year") DO NOTHING;
    `;
  }

  // Atomically increment the sequence counter and return the new last_sequence
  const result = await client.$queryRaw<{ last_sequence: number }[]>(
    Prisma.sql`
      UPDATE admission_number_sequences
      SET "last_sequence" = admission_number_sequences."last_sequence" + ${count},
          "updated_at" = NOW()
      WHERE "year" = ${year}
      RETURNING "last_sequence";
    `
  );

  const endSeq = result[0].last_sequence;
  const startSeq = endSeq - count + 1;

  const admissionNumbers: string[] = [];
  for (let seq = startSeq; seq <= endSeq; seq++) {
    admissionNumbers.push(formatAdmissionNumber(year, seq));
  }

  return admissionNumbers;
}
