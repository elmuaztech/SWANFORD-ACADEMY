import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Swanford Academy — Financial Sequence Number Generator
 * Master Specification Reference: Sections 6, 7, 15, 24
 * Database Architecture Reference: docs/DATABASE_ARCHITECTURE_DESIGN.md
 *
 * System Invariants:
 * - Invoices: INV-YYYY-NNNNN (5 digits)
 * - Payments: PAY-YYYY-NNNNN (5 digits)
 * - Receipts: REC-YYYY-NNNNN (5 digits)
 * - Expenses: EXP-YYYY-NNNNN (5 digits)
 *
 * Concurrency Safety:
 * - Uses atomic PostgreSQL row-level locks via `UPDATE ... RETURNING`
 * - Never uses COUNT(*) + 1
 * - Sequence counters reset/partition by calendar year
 */

export function formatInvoiceNumber(year: number, sequence: number): string {
  const padded = sequence.toString().padStart(5, '0');
  return `INV-${year}-${padded}`;
}

export function formatPaymentReference(year: number, sequence: number): string {
  const padded = sequence.toString().padStart(5, '0');
  return `PAY-${year}-${padded}`;
}

export function formatReceiptNumber(year: number, sequence: number): string {
  const padded = sequence.toString().padStart(5, '0');
  return `REC-${year}-${padded}`;
}

export function formatExpenseNumber(year: number, sequence: number): string {
  const padded = sequence.toString().padStart(5, '0');
  return `EXP-${year}-${padded}`;
}

/**
 * Generates the next sequential invoice number (INV-YYYY-NNNNN)
 */
export async function getNextInvoiceNumber(
  client: Prisma.TransactionClient | typeof prisma = prisma,
  year: number = new Date().getFullYear()
): Promise<string> {
  const highest = await client.invoice.findFirst({
    where: { invoiceNumber: { startsWith: `INV-${year}-` } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });
  let highestExisting = 0;
  if (highest) {
    const match = highest.invoiceNumber.match(/INV-\d{4}-(\d+)/);
    if (match) {
      highestExisting = parseInt(match[1], 10);
    }
  }

  await client.$executeRaw`
    INSERT INTO invoice_number_sequences ("year", "last_sequence", "updated_at")
    VALUES (${year}, ${highestExisting}, NOW())
    ON CONFLICT ("year") DO UPDATE
    SET "last_sequence" = GREATEST(invoice_number_sequences."last_sequence", ${highestExisting});
  `;

  const result = await client.$queryRaw<{ last_sequence: number }[]>`
    UPDATE invoice_number_sequences
    SET "last_sequence" = invoice_number_sequences."last_sequence" + 1,
        "updated_at" = NOW()
    WHERE "year" = ${year}
    RETURNING "last_sequence";
  `;

  if (!result || result.length === 0) {
    throw new Error(`Failed to atomically allocate invoice sequence for year ${year}`);
  }

  return formatInvoiceNumber(year, result[0].last_sequence);
}

/**
 * Generates the next sequential payment reference (PAY-YYYY-NNNNN)
 */
export async function getNextPaymentReference(
  client: Prisma.TransactionClient | typeof prisma = prisma,
  year: number = new Date().getFullYear()
): Promise<string> {
  const highest = await client.payment.findFirst({
    where: { paymentReference: { startsWith: `PAY-${year}-` } },
    orderBy: { paymentReference: 'desc' },
    select: { paymentReference: true },
  });
  let highestExisting = 0;
  if (highest) {
    const match = highest.paymentReference.match(/PAY-\d{4}-(\d+)/);
    if (match) {
      highestExisting = parseInt(match[1], 10);
    }
  }

  await client.$executeRaw`
    INSERT INTO payment_reference_sequences ("year", "last_sequence", "updated_at")
    VALUES (${year}, ${highestExisting}, NOW())
    ON CONFLICT ("year") DO UPDATE
    SET "last_sequence" = GREATEST(payment_reference_sequences."last_sequence", ${highestExisting});
  `;

  const result = await client.$queryRaw<{ last_sequence: number }[]>`
    UPDATE payment_reference_sequences
    SET "last_sequence" = payment_reference_sequences."last_sequence" + 1,
        "updated_at" = NOW()
    WHERE "year" = ${year}
    RETURNING "last_sequence";
  `;

  if (!result || result.length === 0) {
    throw new Error(`Failed to atomically allocate payment sequence for year ${year}`);
  }

  return formatPaymentReference(year, result[0].last_sequence);
}

/**
 * Generates the next sequential receipt number (REC-YYYY-NNNNN)
 */
export async function getNextReceiptNumber(
  client: Prisma.TransactionClient | typeof prisma = prisma,
  year: number = new Date().getFullYear()
): Promise<string> {
  const highest = await client.receipt.findFirst({
    where: { receiptNumber: { startsWith: `REC-${year}-` } },
    orderBy: { receiptNumber: 'desc' },
    select: { receiptNumber: true },
  });
  let highestExisting = 0;
  if (highest) {
    const match = highest.receiptNumber.match(/REC-\d{4}-(\d+)/);
    if (match) {
      highestExisting = parseInt(match[1], 10);
    }
  }

  await client.$executeRaw`
    INSERT INTO receipt_number_sequences ("year", "last_sequence", "updated_at")
    VALUES (${year}, ${highestExisting}, NOW())
    ON CONFLICT ("year") DO UPDATE
    SET "last_sequence" = GREATEST(receipt_number_sequences."last_sequence", ${highestExisting});
  `;

  const result = await client.$queryRaw<{ last_sequence: number }[]>`
    UPDATE receipt_number_sequences
    SET "last_sequence" = receipt_number_sequences."last_sequence" + 1,
        "updated_at" = NOW()
    WHERE "year" = ${year}
    RETURNING "last_sequence";
  `;

  if (!result || result.length === 0) {
    throw new Error(`Failed to atomically allocate receipt sequence for year ${year}`);
  }

  return formatReceiptNumber(year, result[0].last_sequence);
}

/**
 * Generates the next sequential expense number (EXP-YYYY-NNNNN)
 */
export async function getNextExpenseNumber(
  client: Prisma.TransactionClient | typeof prisma = prisma,
  year: number = new Date().getFullYear()
): Promise<string> {
  const highest = await client.expense.findFirst({
    where: { expenseNumber: { startsWith: `EXP-${year}-` } },
    orderBy: { expenseNumber: 'desc' },
    select: { expenseNumber: true },
  });
  let highestExisting = 0;
  if (highest) {
    const match = highest.expenseNumber.match(/EXP-\d{4}-(\d+)/);
    if (match) {
      highestExisting = parseInt(match[1], 10);
    }
  }

  await client.$executeRaw`
    INSERT INTO expense_number_sequences ("year", "last_sequence", "updated_at")
    VALUES (${year}, ${highestExisting}, NOW())
    ON CONFLICT ("year") DO UPDATE
    SET "last_sequence" = GREATEST(expense_number_sequences."last_sequence", ${highestExisting});
  `;

  const result = await client.$queryRaw<{ last_sequence: number }[]>`
    UPDATE expense_number_sequences
    SET "last_sequence" = expense_number_sequences."last_sequence" + 1,
        "updated_at" = NOW()
    WHERE "year" = ${year}
    RETURNING "last_sequence";
  `;

  if (!result || result.length === 0) {
    throw new Error(`Failed to atomically allocate expense sequence for year ${year}`);
  }

  return formatExpenseNumber(year, result[0].last_sequence);
}
