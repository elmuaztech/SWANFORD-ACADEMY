import { prisma } from '@/lib/prisma';
import { InvoiceStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { SafeUser } from '@/lib/auth/service';

/**
 * Swanford Academy — Financial Reporting Engine
 * Master Specification Reference: Sections 6, 15, 24
 *
 * Provides foundational reporting aggregates and debtor analytics required for the Accountant Portal.
 */

export interface FeeCollectionSummary {
  academicSessionId: string;
  academicTermId?: string;
  programmeId?: string;
  totalInvoicedKobo: bigint;
  totalCollectedKobo: bigint;
  totalOutstandingKobo: bigint;
  collectionRatePercentage: number;
  invoiceCounts: {
    total: number;
    fullyPaid: number;
    partiallyPaid: number;
    unpaid: number;
    cancelled: number;
  };
  byPaymentMethod: Record<PaymentMethod, { count: number; totalKobo: bigint }>;
}

export interface DebtorRecord {
  invoiceId: string;
  invoiceNumber: string;
  studentId: string;
  admissionNumber: string;
  studentName: string;
  schoolClassName?: string;
  programmeName: string;
  guardianName: string;
  guardianPhone?: string;
  totalAmountKobo: bigint;
  amountPaidKobo: bigint;
  outstandingBalanceKobo: bigint;
  dueDate: Date;
  isOverdue: boolean;
  daysOverdue: number;
}

export interface CashflowSummary {
  academicSessionId: string;
  academicTermId?: string;
  totalFeeCollectionsKobo: bigint;
  totalExpensesKobo: bigint;
  netOperatingCashflowKobo: bigint;
}

/**
 * Calculates fee collection summary across sessions, terms, and programmes.
 */
export async function getFeeCollectionSummary(
  actor: SafeUser,
  filters: {
    academicSessionId: string;
    academicTermId?: string;
    programmeId?: string;
  },
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<FeeCollectionSummary> {
  await requirePermission(actor, PermissionCode.FINANCE_REPORT_VIEW);

  const whereClause: Prisma.InvoiceWhereInput = {
    academicSessionId: filters.academicSessionId,
    ...(filters.academicTermId && { academicTermId: filters.academicTermId }),
    ...(filters.programmeId && { programmeId: filters.programmeId }),
  };

  const invoices = await client.invoice.findMany({
    where: whereClause,
    select: {
      id: true,
      totalAmountKobo: true,
      amountPaidKobo: true,
      outstandingBalanceKobo: true,
      status: true,
    },
  });

  let totalInvoicedKobo = BigInt(0);
  let totalCollectedKobo = BigInt(0);
  let totalOutstandingKobo = BigInt(0);

  const invoiceCounts = {
    total: invoices.length,
    fullyPaid: 0,
    partiallyPaid: 0,
    unpaid: 0,
    cancelled: 0,
  };

  for (const inv of invoices) {
    if (inv.status === InvoiceStatus.CANCELLED) {
      invoiceCounts.cancelled++;
      continue;
    }

    totalInvoicedKobo += inv.totalAmountKobo;
    totalCollectedKobo += inv.amountPaidKobo;
    totalOutstandingKobo += inv.outstandingBalanceKobo;

    if (inv.status === InvoiceStatus.PAID) {
      invoiceCounts.fullyPaid++;
    } else if (inv.status === InvoiceStatus.PARTIALLY_PAID) {
      invoiceCounts.partiallyPaid++;
    } else {
      invoiceCounts.unpaid++;
    }
  }

  const collectionRatePercentage =
    totalInvoicedKobo > BigInt(0)
      ? Number((totalCollectedKobo * BigInt(10000)) / totalInvoicedKobo) / 100
      : 0;

  // Breakdown by payment method from confirmed payments
  const confirmedPayments = await client.payment.findMany({
    where: {
      status: PaymentStatus.CONFIRMED,
      invoice: whereClause,
    },
    select: {
      paymentMethod: true,
      amountKobo: true,
    },
  });

  const byPaymentMethod: Record<PaymentMethod, { count: number; totalKobo: bigint }> = {
    [PaymentMethod.PAYSTACK]: { count: 0, totalKobo: BigInt(0) },
    [PaymentMethod.BANK_TRANSFER]: { count: 0, totalKobo: BigInt(0) },
    [PaymentMethod.CASH]: { count: 0, totalKobo: BigInt(0) },
    [PaymentMethod.POS]: { count: 0, totalKobo: BigInt(0) },
    [PaymentMethod.CHEQUE]: { count: 0, totalKobo: BigInt(0) },
  };

  for (const p of confirmedPayments) {
    const entry = byPaymentMethod[p.paymentMethod];
    if (entry) {
      entry.count++;
      entry.totalKobo += p.amountKobo;
    }
  }

  return {
    academicSessionId: filters.academicSessionId,
    academicTermId: filters.academicTermId,
    programmeId: filters.programmeId,
    totalInvoicedKobo,
    totalCollectedKobo,
    totalOutstandingKobo,
    collectionRatePercentage,
    invoiceCounts,
    byPaymentMethod,
  };
}

/**
 * Compiles a comprehensive debtor report of students with outstanding fee balances.
 */
export async function getDebtorReport(
  actor: SafeUser,
  filters: {
    academicSessionId: string;
    academicTermId?: string;
    programmeId?: string;
    schoolClassId?: string;
  },
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<DebtorRecord[]> {
  await requirePermission(actor, PermissionCode.FINANCE_REPORT_VIEW);

  const now = new Date();

  const invoices = await client.invoice.findMany({
    where: {
      academicSessionId: filters.academicSessionId,
      ...(filters.academicTermId && { academicTermId: filters.academicTermId }),
      ...(filters.programmeId && { programmeId: filters.programmeId }),
      status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID] },
      outstandingBalanceKobo: { gt: BigInt(0) },
      ...(filters.schoolClassId && {
        student: {
          programmeEnrollments: {
            some: {
              schoolClassId: filters.schoolClassId,
              enrollmentStatus: 'ACTIVE',
            },
          },
        },
      }),
    },
    include: {
      student: {
        include: {
          programmeEnrollments: {
            where: {
              academicSessionId: filters.academicSessionId,
              ...(filters.academicTermId && { academicTermId: filters.academicTermId }),
              enrollmentStatus: 'ACTIVE',
            },
            include: { schoolClass: true },
          },
        },
      },
      guardian: true,
      programme: true,
    },
    orderBy: { dueDate: 'asc' },
  });

  return invoices.map((inv) => {
    const dueTime = new Date(inv.dueDate).getTime();
    const isOverdue = now.getTime() > dueTime;
    const diffMs = now.getTime() - dueTime;
    const daysOverdue = isOverdue ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) : 0;

    const enrollment = inv.student.programmeEnrollments.find(
      (e) => e.programmeId === inv.programmeId
    );

    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      studentId: inv.student.id,
      admissionNumber: inv.student.admissionNumber,
      studentName: `${inv.student.firstName} ${inv.student.lastName}`.trim(),
      schoolClassName: enrollment?.schoolClass.name,
      programmeName: inv.programme.name,
      guardianName: `${inv.guardian.firstName} ${inv.guardian.lastName}`.trim(),
      guardianPhone: inv.guardian.phonePrimary || undefined,
      totalAmountKobo: inv.totalAmountKobo,
      amountPaidKobo: inv.amountPaidKobo,
      outstandingBalanceKobo: inv.outstandingBalanceKobo,
      dueDate: inv.dueDate,
      isOverdue,
      daysOverdue,
    };
  });
}

/**
 * Calculates net operating cashflow: fee collections minus operating expenses.
 */
export async function getFinancialCashflowSummary(
  actor: SafeUser,
  filters: {
    academicSessionId: string;
    academicTermId?: string;
  },
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<CashflowSummary> {
  await requirePermission(actor, PermissionCode.FINANCE_REPORT_VIEW);

  // 1. Total confirmed fee collections
  const confirmedPayments = await client.payment.findMany({
    where: {
      status: PaymentStatus.CONFIRMED,
      invoice: {
        academicSessionId: filters.academicSessionId,
        ...(filters.academicTermId && { academicTermId: filters.academicTermId }),
      },
    },
    select: { amountKobo: true },
  });

  let totalFeeCollectionsKobo = BigInt(0);
  for (const p of confirmedPayments) {
    totalFeeCollectionsKobo += p.amountKobo;
  }

  // 2. Total recorded expenses (excluding voided)
  const expenses = await client.expense.findMany({
    where: {
      academicSessionId: filters.academicSessionId,
      ...(filters.academicTermId && { academicTermId: filters.academicTermId }),
      status: 'RECORDED',
    },
    select: { amountKobo: true },
  });

  let totalExpensesKobo = BigInt(0);
  for (const e of expenses) {
    totalExpensesKobo += e.amountKobo;
  }

  const netOperatingCashflowKobo = totalFeeCollectionsKobo - totalExpensesKobo;

  return {
    academicSessionId: filters.academicSessionId,
    academicTermId: filters.academicTermId,
    totalFeeCollectionsKobo,
    totalExpensesKobo,
    netOperatingCashflowKobo,
  };
}

/**
 * Detailed chronological payment ledger for audit and reconciliation verification.
 */
export async function getPaymentAuditLedger(
  actor: SafeUser,
  filters: {
    academicSessionId?: string;
    academicTermId?: string;
    status?: PaymentStatus;
    paymentMethod?: PaymentMethod;
    startDate?: Date;
    endDate?: Date;
  },
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  await requirePermission(actor, PermissionCode.FINANCE_REPORT_VIEW);

  return client.payment.findMany({
    where: {
      ...(filters.status && { status: filters.status }),
      ...(filters.paymentMethod && { paymentMethod: filters.paymentMethod }),
      ...(filters.startDate && { paidAt: { gte: filters.startDate } }),
      ...(filters.endDate && { paidAt: { lte: filters.endDate } }),
      invoice: {
        ...(filters.academicSessionId && { academicSessionId: filters.academicSessionId }),
        ...(filters.academicTermId && { academicTermId: filters.academicTermId }),
      },
    },
    include: {
      receipt: true,
      student: { select: { admissionNumber: true, firstName: true, lastName: true } },
      payerGuardian: { select: { firstName: true, lastName: true, phonePrimary: true } },
      invoice: { select: { invoiceNumber: true, totalAmountKobo: true } },
      recordedByUser: { select: { email: true } },
      reconciledByUser: { select: { email: true } },
      reversedByUser: { select: { email: true } },
    },
    orderBy: { paidAt: 'desc' },
  });
}
