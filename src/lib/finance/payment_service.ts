import { prisma } from '@/lib/prisma';
import {
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  RoleCode,
} from '@prisma/client';
import { requirePermission, AuthorizationError, getUserRoles } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { SafeUser } from '@/lib/auth/service';
import { parseKoboFromDto } from '@/lib/money';
import { getNextPaymentReference, getNextReceiptNumber } from './sequences';
import { z } from 'zod';

export const PaymentAllocationItemSchema = z.object({
  invoiceItemId: z.string().uuid(),
  amountKobo: z.union([z.string(), z.number(), z.bigint()]).refine(
    (val) => {
      try {
        return BigInt(val) > BigInt(0);
      } catch {
        return false;
      }
    },
    { message: 'Allocation amount must be greater than zero' }
  ),
});

export const RecordManualPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amountKobo: z.union([z.string(), z.number(), z.bigint()]).refine(
    (val) => {
      try {
        return BigInt(val) > BigInt(0);
      } catch {
        return false;
      }
    },
    { message: 'Payment amount must be greater than 0 Kobo' }
  ),
  paymentMethod: z.nativeEnum(PaymentMethod),
  payerGuardianId: z.string().uuid().optional().nullable(),
  bankReference: z.string().max(100).optional().nullable(),
  bankName: z.string().max(100).optional().nullable(),
  idempotencyKey: z.string().max(150).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  autoConfirm: z.boolean().optional(),
  allocations: z.array(PaymentAllocationItemSchema).optional(),
});

export type RecordManualPaymentInput = z.input<typeof RecordManualPaymentSchema>;

export const ReconcilePaymentSchema = z.object({
  paymentId: z.string().uuid(),
  bankReference: z.string().min(1, 'Bank reference required for reconciliation').max(100),
  bankName: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export type ReconcilePaymentInput = z.input<typeof ReconcilePaymentSchema>;

/**
 * Swanford Academy — Payment Engine
 * Master Specification Reference: Sections 6, 7, 15, 24
 *
 * System Invariants & Final Amendments:
 * 1. Concurrency-Safe: Uses PostgreSQL row-level locks (SELECT ... FOR UPDATE) on the Invoice.
 * 2. Overpayment Protection: Payment allocation must NEVER exceed outstanding balance.
 * 3. Separation of Recorded vs Confirmed: Official receipts issued ONLY when CONFIRMED.
 * 4. Immutable Reversal: Preserves original payments, allocations, and receipts (marked voided).
 * 5. Direct Allocation: Allocates directly to invoices and invoice items — NO wallet system.
 */
export async function recordManualPayment(
  actor: SafeUser,
  input: RecordManualPaymentInput,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  await requirePermission(actor, PermissionCode.FINANCE_PAYMENT_RECONCILE);
  const validated = RecordManualPaymentSchema.parse(input);
  const paymentKobo = parseKoboFromDto(validated.amountKobo);

  // Check idempotency first (if key provided)
  if (validated.idempotencyKey) {
    const existingKey = await client.payment.findUnique({
      where: { idempotencyKey: validated.idempotencyKey },
      include: {
        receipt: true,
        allocations: true,
        invoice: true,
      },
    });
    if (existingKey) {
      return {
        payment: existingKey,
        receipt: existingKey.receipt,
      };
    }
  }

  // Check duplicate bank reference for manual bank transfer if provided
  if (
    validated.paymentMethod === PaymentMethod.BANK_TRANSFER &&
    validated.bankReference &&
    validated.bankReference.trim().length > 0
  ) {
    const existingRef = await client.payment.findFirst({
      where: {
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        bankReference: validated.bankReference.trim(),
        status: { not: PaymentStatus.REVERSED },
      },
    });
    if (existingRef) {
      throw new AuthorizationError(
        `A payment with bank reference '${validated.bankReference.trim()}' has already been recorded (${existingRef.paymentReference}).`,
        400,
        'DUPLICATE_BANK_REFERENCE'
      );
    }
  }

  const execute = async (tx: Prisma.TransactionClient) => {
    // 1. Transactional Concurrency Lock: SELECT ... FOR UPDATE on Invoice
    const lockedInvoices = await tx.$queryRaw<
      Array<{
        id: string;
        student_id: string;
        guardian_id: string;
        total_amount_kobo: bigint;
        amount_paid_kobo: bigint;
        outstanding_balance_kobo: bigint;
        status: InvoiceStatus;
      }>
    >`
      SELECT id, student_id, guardian_id, total_amount_kobo, amount_paid_kobo, outstanding_balance_kobo, status
      FROM invoices
      WHERE id = ${validated.invoiceId}::uuid
      FOR UPDATE;
    `;

    if (!lockedInvoices || lockedInvoices.length === 0) {
      throw new AuthorizationError('Invoice not found.', 404, 'INVOICE_NOT_FOUND');
    }

    const lockedInvoice = lockedInvoices[0];

    if (lockedInvoice.status === InvoiceStatus.CANCELLED) {
      throw new AuthorizationError('Cannot record payment for a cancelled invoice.', 400, 'INVOICE_CANCELLED');
    }

    if (lockedInvoice.status === InvoiceStatus.PAID || lockedInvoice.outstanding_balance_kobo <= BigInt(0)) {
      throw new AuthorizationError(
        'Invoice has already been paid in full. Overpayment is strictly rejected.',
        400,
        'INVOICE_ALREADY_PAID'
      );
    }

    // Overpayment Protection
    if (paymentKobo > lockedInvoice.outstanding_balance_kobo) {
      throw new AuthorizationError(
        `Payment amount exceeds outstanding balance. Outstanding balance is ₦${(
          Number(lockedInvoice.outstanding_balance_kobo) / 100
        ).toFixed(2)}, but attempted payment is ₦${(Number(paymentKobo) / 100).toFixed(2)}.`,
        400,
        'PAYMENT_EXCEEDS_OUTSTANDING_BALANCE'
      );
    }

    // 2. Determine confirmation state
    // Per Amendment 1: Do not automatically issue an official receipt merely because a manual payment was entered.
    // Cash / POS can be auto-confirmed if requested by the cashier/accountant in hand;
    // Bank Transfer / Cheque default to PENDING_VERIFICATION unless explicit autoConfirm requested.
    let status: PaymentStatus;
    if (validated.autoConfirm !== undefined) {
      status = validated.autoConfirm ? PaymentStatus.CONFIRMED : PaymentStatus.PENDING_VERIFICATION;
    } else if (
      validated.paymentMethod === PaymentMethod.CASH ||
      validated.paymentMethod === PaymentMethod.POS
    ) {
      status = PaymentStatus.CONFIRMED;
    } else {
      status = PaymentStatus.PENDING_VERIFICATION;
    }

    // 3. Concurrency-safe atomic Payment Reference (PAY-YYYY-NNNNN)
    const currentYear = new Date().getFullYear();
    const paymentReference = await getNextPaymentReference(tx, currentYear);

    // 4. Create Payment Record
    const payment = await tx.payment.create({
      data: {
        paymentReference,
        invoiceId: lockedInvoice.id,
        studentId: lockedInvoice.student_id,
        payerGuardianId: validated.payerGuardianId || lockedInvoice.guardian_id,
        amountKobo: paymentKobo,
        paymentMethod: validated.paymentMethod,
        status,
        bankReference: validated.bankReference?.trim() || null,
        bankName: validated.bankName?.trim() || null,
        idempotencyKey: validated.idempotencyKey?.trim() || null,
        notes: validated.notes?.trim() || null,
        recordedByUserId: actor.id,
        paidAt: new Date(),
        ...(status === PaymentStatus.CONFIRMED && {
          reconciledAt: new Date(),
          reconciledByUserId: actor.id,
        }),
      },
    });

    // 5. Create Payment Allocations (Direct invoice and/or invoice item allocation)
    const invoiceItems = await tx.invoiceItem.findMany({
      where: { invoiceId: lockedInvoice.id },
      orderBy: { createdAt: 'asc' },
    });

    if (validated.allocations && validated.allocations.length > 0) {
      // Validate caller allocations sum to paymentKobo
      let sumAllocations = BigInt(0);
      for (const alloc of validated.allocations) {
        const itemAmount = parseKoboFromDto(alloc.amountKobo);
        sumAllocations += itemAmount;
        await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            invoiceId: lockedInvoice.id,
            invoiceItemId: alloc.invoiceItemId,
            amountKobo: itemAmount,
          },
        });
      }

      if (sumAllocations !== paymentKobo) {
        throw new AuthorizationError(
          'Sum of itemized allocations does not match total payment amount.',
          400,
          'ALLOCATION_SUM_MISMATCH'
        );
      }
    } else {
      // Default: Allocate sequentially across invoice items (FIFO item allocation)
      let remainingToAllocate = paymentKobo;

      // Find existing CONFIRMED allocations for each item to compute item outstanding balance
      const existingAllocations = await tx.paymentAllocation.findMany({
        where: {
          invoiceId: lockedInvoice.id,
          payment: { status: PaymentStatus.CONFIRMED },
        },
      });

      const itemPaidMap = new Map<string, bigint>();
      for (const ea of existingAllocations) {
        if (ea.invoiceItemId) {
          const prev = itemPaidMap.get(ea.invoiceItemId) || BigInt(0);
          itemPaidMap.set(ea.invoiceItemId, prev + ea.amountKobo);
        }
      }

      for (const item of invoiceItems) {
        if (remainingToAllocate <= BigInt(0)) break;
        const itemPaid = itemPaidMap.get(item.id) || BigInt(0);
        const itemRemaining = item.totalAmountKobo - itemPaid;
        if (itemRemaining <= BigInt(0)) continue;

        const allocAmount = remainingToAllocate < itemRemaining ? remainingToAllocate : itemRemaining;
        await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            invoiceId: lockedInvoice.id,
            invoiceItemId: item.id,
            amountKobo: allocAmount,
          },
        });
        remainingToAllocate -= allocAmount;
      }

      // If any remainder (or no items), allocate directly to invoice
      if (remainingToAllocate > BigInt(0)) {
        await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            invoiceId: lockedInvoice.id,
            invoiceItemId: null,
            amountKobo: remainingToAllocate,
          },
        });
      }
    }

    // 6. Handle Invoice Balance & Receipt based on confirmation status
    let receipt = null;
    if (status === PaymentStatus.CONFIRMED) {
      // Recalculate invoice balance from ALL confirmed payments
      const newAmountPaid = lockedInvoice.amount_paid_kobo + paymentKobo;
      const newOutstanding = lockedInvoice.total_amount_kobo - newAmountPaid;
      const newStatus =
        newOutstanding <= BigInt(0) ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

      await tx.invoice.update({
        where: { id: lockedInvoice.id },
        data: {
          amountPaidKobo: newAmountPaid,
          outstandingBalanceKobo: newOutstanding,
          status: newStatus,
        },
      });

      // Issue Official Receipt ONLY upon CONFIRMED status (Amendment 1)
      const guardian = await tx.guardian.findUnique({
        where: { id: lockedInvoice.guardian_id },
      });
      const issuedToName = guardian
        ? `${guardian.firstName} ${guardian.lastName}`.trim()
        : 'Guardian/Parent';

      const receiptNumber = await getNextReceiptNumber(tx, currentYear);
      receipt = await tx.receipt.create({
        data: {
          receiptNumber,
          paymentId: payment.id,
          invoiceId: lockedInvoice.id,
          issuedToName,
          amountKobo: paymentKobo,
          issuedAt: new Date(),
        },
      });
    }

    // 7. Audit Log
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: status === PaymentStatus.CONFIRMED ? 'PAYMENT_RECORDED_CONFIRMED' : 'PAYMENT_RECORDED_PENDING',
        entityType: 'Payment',
        entityId: payment.id,
        newValues: {
          paymentReference: payment.paymentReference,
          invoiceId: lockedInvoice.id,
          amountKobo: payment.amountKobo.toString(),
          paymentMethod: payment.paymentMethod,
          status: payment.status,
          receiptNumber: receipt?.receiptNumber || null,
        },
      },
    });

    return {
      payment,
      receipt,
    };
  };

  if ('$transaction' in client) {
    return (client as typeof prisma).$transaction(execute);
  }
  return execute(client as Prisma.TransactionClient);
}

/**
 * Confirms or reconciles a pending manual payment (e.g. bank transfer verified against bank statement).
 * Issues official receipt upon confirmation (Amendment 1).
 */
export async function confirmOrReconcilePayment(
  actor: SafeUser,
  input: ReconcilePaymentInput,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  await requirePermission(actor, PermissionCode.FINANCE_PAYMENT_RECONCILE);
  const validated = ReconcilePaymentSchema.parse(input);

  const execute = async (tx: Prisma.TransactionClient) => {
    const payment = await tx.payment.findUnique({
      where: { id: validated.paymentId },
      include: { invoice: true, receipt: true },
    });

    if (!payment) {
      throw new AuthorizationError('Payment not found.', 404, 'PAYMENT_NOT_FOUND');
    }

    if (payment.status === PaymentStatus.CONFIRMED) {
      throw new AuthorizationError('Payment has already been confirmed.', 400, 'ALREADY_CONFIRMED');
    }

    if (payment.status === PaymentStatus.REVERSED) {
      throw new AuthorizationError('Cannot reconcile a reversed payment.', 400, 'PAYMENT_REVERSED');
    }

    // Lock invoice FOR UPDATE to ensure concurrency safety
    const lockedInvoices = await tx.$queryRaw<
      Array<{
        id: string;
        guardian_id: string;
        total_amount_kobo: bigint;
        amount_paid_kobo: bigint;
        outstanding_balance_kobo: bigint;
      }>
    >`
      SELECT id, guardian_id, total_amount_kobo, amount_paid_kobo, outstanding_balance_kobo
      FROM invoices
      WHERE id = ${payment.invoiceId}::uuid
      FOR UPDATE;
    `;

    const lockedInvoice = lockedInvoices[0];

    // Verify confirmation does not exceed outstanding balance
    if (payment.amountKobo > lockedInvoice.outstanding_balance_kobo) {
      throw new AuthorizationError(
        'Confirming this payment would exceed the invoice outstanding balance.',
        400,
        'PAYMENT_EXCEEDS_OUTSTANDING_BALANCE'
      );
    }

    // 1. Update Payment status to CONFIRMED
    const updatedPayment = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.CONFIRMED,
        bankReference: validated.bankReference.trim(),
        ...(validated.bankName && { bankName: validated.bankName.trim() }),
        ...(validated.notes && { notes: validated.notes.trim() }),
        reconciledAt: new Date(),
        reconciledByUserId: actor.id,
      },
    });

    // 2. Update Invoice balance
    const newAmountPaid = lockedInvoice.amount_paid_kobo + payment.amountKobo;
    const newOutstanding = lockedInvoice.total_amount_kobo - newAmountPaid;
    const newStatus =
      newOutstanding <= BigInt(0) ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

    await tx.invoice.update({
      where: { id: lockedInvoice.id },
      data: {
        amountPaidKobo: newAmountPaid,
        outstandingBalanceKobo: newOutstanding,
        status: newStatus,
      },
    });

    // 3. Issue Official Receipt upon confirmation
    let receipt = payment.receipt;
    if (!receipt) {
      const currentYear = new Date().getFullYear();
      const receiptNumber = await getNextReceiptNumber(tx, currentYear);
      const guardian = await tx.guardian.findUnique({
        where: { id: lockedInvoice.guardian_id },
      });
      const issuedToName = guardian
        ? `${guardian.firstName} ${guardian.lastName}`.trim()
        : 'Guardian/Parent';

      receipt = await tx.receipt.create({
        data: {
          receiptNumber,
          paymentId: payment.id,
          invoiceId: lockedInvoice.id,
          issuedToName,
          amountKobo: payment.amountKobo,
          issuedAt: new Date(),
        },
      });
    }

    // 4. Audit Log
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'PAYMENT_RECONCILED_AND_CONFIRMED',
        entityType: 'Payment',
        entityId: payment.id,
        oldValues: { status: payment.status },
        newValues: {
          status: updatedPayment.status,
          bankReference: updatedPayment.bankReference,
          receiptNumber: receipt.receiptNumber,
          reconciledAt: updatedPayment.reconciledAt,
        },
      },
    });

    return {
      payment: updatedPayment,
      receipt,
    };
  };

  if ('$transaction' in client) {
    return (client as typeof prisma).$transaction(execute);
  }
  return execute(client as Prisma.TransactionClient);
}

/**
 * Reverses a payment while strictly preserving immutable financial history (Amendment 2).
 * Does NOT delete the payment, allocations, or receipt.
 * Voids the receipt, transitions payment to REVERSED, and authoritatively recalculates invoice balance.
 */
export async function reversePayment(
  actor: SafeUser,
  paymentId: string,
  reversalReason: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  await requirePermission(actor, PermissionCode.FINANCE_PAYMENT_RECONCILE);

  if (!reversalReason || reversalReason.trim().length === 0) {
    throw new AuthorizationError('Reversal reason is required.', 400, 'REVERSAL_REASON_REQUIRED');
  }

  const execute = async (tx: Prisma.TransactionClient) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { receipt: true, invoice: true },
    });

    if (!payment) {
      throw new AuthorizationError('Payment not found.', 404, 'PAYMENT_NOT_FOUND');
    }

    if (payment.status === PaymentStatus.REVERSED) {
      throw new AuthorizationError('Payment has already been reversed.', 400, 'ALREADY_REVERSED');
    }

    const wasConfirmed = payment.status === PaymentStatus.CONFIRMED;

    // 1. Lock invoice row FOR UPDATE
    const lockedInvoices = await tx.$queryRaw<
      Array<{
        id: string;
        total_amount_kobo: bigint;
        amount_paid_kobo: bigint;
        outstanding_balance_kobo: bigint;
      }>
    >`
      SELECT id, total_amount_kobo, amount_paid_kobo, outstanding_balance_kobo
      FROM invoices
      WHERE id = ${payment.invoiceId}::uuid
      FOR UPDATE;
    `;

    const lockedInvoice = lockedInvoices[0];

    // 2. Update Payment -> REVERSED (preserves record, adds audit stamps)
    const updatedPayment = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.REVERSED,
        reversedAt: new Date(),
        reversedByUserId: actor.id,
        reversalReason: reversalReason.trim(),
      },
    });

    // 3. Mark Receipt as voided if one exists (never delete paper trail)
    if (payment.receipt) {
      await tx.receipt.update({
        where: { id: payment.receipt.id },
        data: {
          isVoided: true,
          voidedAt: new Date(),
          voidReason: reversalReason.trim(),
        },
      });
    }

    // 4. If payment was CONFIRMED, recalculate invoice balance from remaining CONFIRMED payments
    if (wasConfirmed) {
      const remainingConfirmedPayments = await tx.payment.findMany({
        where: {
          invoiceId: payment.invoiceId,
          status: PaymentStatus.CONFIRMED,
          id: { not: payment.id },
        },
      });

      let newAmountPaid = BigInt(0);
      for (const p of remainingConfirmedPayments) {
        newAmountPaid += p.amountKobo;
      }

      const newOutstanding = lockedInvoice.total_amount_kobo - newAmountPaid;
      const newStatus =
        newAmountPaid === BigInt(0)
          ? InvoiceStatus.ISSUED
          : newOutstanding <= BigInt(0)
          ? InvoiceStatus.PAID
          : InvoiceStatus.PARTIALLY_PAID;

      await tx.invoice.update({
        where: { id: lockedInvoice.id },
        data: {
          amountPaidKobo: newAmountPaid,
          outstandingBalanceKobo: newOutstanding,
          status: newStatus,
        },
      });
    }

    // 5. Audit Log
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'PAYMENT_REVERSED',
        entityType: 'Payment',
        entityId: payment.id,
        oldValues: {
          status: payment.status,
          receiptNumber: payment.receipt?.receiptNumber || null,
        },
        newValues: {
          status: updatedPayment.status,
          reversalReason: updatedPayment.reversalReason,
          reversedAt: updatedPayment.reversedAt,
          receiptVoided: !!payment.receipt,
        },
      },
    });

    return updatedPayment;
  };

  if ('$transaction' in client) {
    return (client as typeof prisma).$transaction(execute);
  }
  return execute(client as Prisma.TransactionClient);
}

/**
 * Retrieves payment details by ID.
 */
export async function getPaymentById(
  actor: SafeUser,
  paymentId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const roles = await getUserRoles(actor.id);
  const isFinanceStaff =
    roles.includes(RoleCode.ACCOUNTANT) ||
    roles.includes(RoleCode.SUPER_ADMIN) ||
    roles.includes(RoleCode.ADMIN);

  const isParent = roles.includes(RoleCode.PARENT);

  if (!isFinanceStaff && !isParent) {
    throw new AuthorizationError('Not authorized to view payments.', 403, 'FORBIDDEN');
  }

  const payment = await client.payment.findUnique({
    where: { id: paymentId },
    include: {
      receipt: true,
      allocations: { include: { invoiceItem: true } },
      invoice: true,
      student: true,
      payerGuardian: true,
      recordedByUser: { select: { id: true, email: true } },
      reconciledByUser: { select: { id: true, email: true } },
      reversedByUser: { select: { id: true, email: true } },
    },
  });

  if (!payment) {
    throw new AuthorizationError('Payment not found.', 404, 'PAYMENT_NOT_FOUND');
  }

  if (isParent && !isFinanceStaff) {
    const parentGuardian = await client.guardian.findUnique({
      where: { userId: actor.id },
      include: {
        relationships: { where: { status: 'ACTIVE' } },
      },
    });
    const linkedIds = parentGuardian?.relationships.map((r) => r.studentId) || [];
    if (!linkedIds.includes(payment.studentId)) {
      throw new AuthorizationError('Access denied.', 403, 'CHILD_SCOPE_VIOLATION');
    }
  }

  return payment;
}

/**
 * Lists payments with filtering.
 */
export async function listPayments(
  actor: SafeUser,
  filters: {
    invoiceId?: string;
    studentId?: string;
    status?: PaymentStatus;
    paymentMethod?: PaymentMethod;
    startDate?: Date;
    endDate?: Date;
  },
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const roles = await getUserRoles(actor.id);
  const isFinanceStaff =
    roles.includes(RoleCode.ACCOUNTANT) ||
    roles.includes(RoleCode.SUPER_ADMIN) ||
    roles.includes(RoleCode.ADMIN);

  const isParent = roles.includes(RoleCode.PARENT);

  if (!isFinanceStaff && !isParent) {
    throw new AuthorizationError('Not authorized to view payments.', 403, 'FORBIDDEN');
  }

  let allowedStudentIds: string[] | undefined = undefined;

  if (isParent && !isFinanceStaff) {
    const parentGuardian = await client.guardian.findUnique({
      where: { userId: actor.id },
      include: { relationships: { where: { status: 'ACTIVE' } } },
    });
    allowedStudentIds = parentGuardian?.relationships.map((r) => r.studentId) || [];
  }

  return client.payment.findMany({
    where: {
      ...(filters.invoiceId && { invoiceId: filters.invoiceId }),
      ...(filters.status && { status: filters.status }),
      ...(filters.paymentMethod && { paymentMethod: filters.paymentMethod }),
      ...(filters.startDate && { paidAt: { gte: filters.startDate } }),
      ...(filters.endDate && { paidAt: { lte: filters.endDate } }),
      ...(filters.studentId
        ? { studentId: filters.studentId }
        : allowedStudentIds
        ? { studentId: { in: allowedStudentIds } }
        : {}),
    },
    include: {
      receipt: true,
      allocations: true,
      student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } },
      payerGuardian: { select: { id: true, firstName: true, lastName: true } },
      invoice: { select: { id: true, invoiceNumber: true, totalAmountKobo: true } },
    },
    orderBy: { paidAt: 'desc' },
  });
}

/**
 * Retrieves official receipt by ID.
 */
export async function getReceiptById(
  actor: SafeUser,
  receiptId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const roles = await getUserRoles(actor.id);
  const isFinanceStaff =
    roles.includes(RoleCode.ACCOUNTANT) ||
    roles.includes(RoleCode.SUPER_ADMIN) ||
    roles.includes(RoleCode.ADMIN);

  const isParent = roles.includes(RoleCode.PARENT);

  if (!isFinanceStaff && !isParent) {
    throw new AuthorizationError('Not authorized to view receipts.', 403, 'FORBIDDEN');
  }

  const receipt = await client.receipt.findUnique({
    where: { id: receiptId },
    include: {
      payment: {
        include: {
          allocations: { include: { invoiceItem: true } },
          student: true,
          payerGuardian: true,
        },
      },
      invoice: {
        include: {
          items: true,
          academicSession: true,
          academicTerm: true,
          programme: true,
        },
      },
    },
  });

  if (!receipt) {
    throw new AuthorizationError('Receipt not found.', 404, 'RECEIPT_NOT_FOUND');
  }

  if (isParent && !isFinanceStaff) {
    const parentGuardian = await client.guardian.findUnique({
      where: { userId: actor.id },
      include: { relationships: { where: { status: 'ACTIVE' } } },
    });
    const linkedIds = parentGuardian?.relationships.map((r) => r.studentId) || [];
    if (!linkedIds.includes(receipt.payment.studentId)) {
      throw new AuthorizationError('Access denied.', 403, 'CHILD_SCOPE_VIOLATION');
    }
  }

  return receipt;
}
