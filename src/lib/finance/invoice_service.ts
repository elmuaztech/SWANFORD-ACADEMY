import { prisma } from '@/lib/prisma';
import {
  InvoiceStatus,
  Prisma,
  RoleCode,
  NotificationChannel,
  NotificationStatus,
} from '@prisma/client';
import { requirePermission, AuthorizationError, getUserRoles } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { SafeUser } from '@/lib/auth/service';
import { parseKoboFromDto } from '@/lib/money';
import { getNextInvoiceNumber } from './sequences';
import { resolveFeeStructureForStudent } from './fee_structure_service';
import { z } from 'zod';
import { enqueueNotification } from '@/lib/notifications/outbox';
import { NotificationCategory } from '@/lib/notifications/types';
import { renderInvoiceIssuedEmail } from '@/lib/notifications/templates';

export const InvoiceItemInputSchema = z.object({
  description: z.string().min(1, 'Description is required').max(200),
  unitAmountKobo: z.union([z.string(), z.number(), z.bigint()]).refine(
    (val) => {
      try {
        const k = BigInt(val);
        return k >= BigInt(0);
      } catch {
        return false;
      }
    },
    { message: 'Unit amount in Kobo must be non-negative' }
  ),
  quantity: z.number().int().min(1).default(1),
});

const MONTH_NAMES = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function getBillingMonthName(monthNumber: number): string {
  return MONTH_NAMES[monthNumber] || `Month ${monthNumber}`;
}

export const CreateInvoiceSchema = z.object({
  studentId: z.string().uuid(),
  guardianId: z.string().uuid().optional(),
  academicSessionId: z.string().uuid(),
  academicTermId: z.string().uuid(),
  programmeId: z.string().uuid(),
  feeStructureId: z.string().uuid().optional().nullable(),
  dueDate: z.coerce.date(),
  billingMonth: z.number().int().min(0).max(12).default(0),
  billingPeriodName: z.string().optional().nullable(),
  isSpecialRate: z.boolean().default(false),
  items: z.array(InvoiceItemInputSchema).optional(),
});

export type CreateInvoiceInput = z.input<typeof CreateInvoiceSchema>;

export const BatchInvoiceGenerationSchema = z.object({
  academicSessionId: z.string().uuid(),
  academicTermId: z.string().uuid(),
  programmeId: z.string().uuid(),
  schoolClassId: z.string().uuid().optional().nullable(),
  dueDate: z.coerce.date(),
  billingMonth: z.number().int().min(0).max(12).default(0),
  billingPeriodName: z.string().optional().nullable(),
  isAdmissionFee: z.boolean().default(false),
});

export type BatchInvoiceGenerationInput = z.input<typeof BatchInvoiceGenerationSchema>;

/**
 * Creates an immutable student invoice snapshotting fee items at issuance.
 * Master Specification Reference: Sections 6, 15, 24
 */
export async function createInvoice(
  actor: SafeUser | null,
  input: CreateInvoiceInput,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  // If invoked by user context (not system internal matriculation), enforce authorization
  if (actor) {
    await requirePermission(actor, PermissionCode.FINANCE_INVOICE_MANAGE);
  }
  const validated = CreateInvoiceSchema.parse(input);

  const execute = async (tx: Prisma.TransactionClient) => {
    // 1. Verify Student exists
    const student = await tx.student.findUnique({
      where: { id: validated.studentId },
      include: {
        guardianLinks: {
          where: { status: 'ACTIVE' },
          include: { guardian: true },
        },
      },
    });

    if (!student) {
      throw new AuthorizationError('Student not found.', 404, 'STUDENT_NOT_FOUND');
    }

    // 2. Resolve Guardian for billing
    let guardianId = validated.guardianId;
    if (!guardianId) {
      const primaryLink =
        student.guardianLinks.find((l) => l.receivesInvoices && l.isPrimaryContact) ||
        student.guardianLinks.find((l) => l.receivesInvoices) ||
        student.guardianLinks[0];

      if (!primaryLink) {
        throw new AuthorizationError(
          `Cannot issue invoice: Student (${student.admissionNumber}) has no active guardian linked to receive invoices.`,
          400,
          'NO_GUARDIAN_LINKED'
        );
      }
      guardianId = primaryLink.guardianId;
    }

    const billingMonth = validated.billingMonth ?? 0;

    // 3. Duplicate Prevention Guard (Unique student-programme-session-term-month)
    const existing = await tx.invoice.findUnique({
      where: {
        unique_student_programme_term_invoice: {
          studentId: validated.studentId,
          programmeId: validated.programmeId,
          academicSessionId: validated.academicSessionId,
          academicTermId: validated.academicTermId,
          billingMonth,
        },
      },
    });

    if (existing) {
      const periodLabel = existing.billingPeriodName
        ? ` for ${existing.billingPeriodName}`
        : ' for the specified term';
      throw new AuthorizationError(
        `Invoice (${existing.invoiceNumber}) has already been issued for this student and programme${periodLabel}.`,
        400,
        'DUPLICATE_INVOICE'
      );
    }

    // 4. Resolve Special Fee Rate (if student has an approved legacy/special rate)
    let isSpecialRate = validated.isSpecialRate ?? false;
    let specialRate = null;

    if (!validated.items || validated.items.length === 0) {
      specialRate = await tx.studentSpecialFeeRate.findFirst({
        where: {
          studentId: validated.studentId,
          programmeId: validated.programmeId,
          academicSessionId: validated.academicSessionId,
          isActive: true,
          OR: [
            { academicTermId: null },
            { academicTermId: validated.academicTermId },
          ],
          AND: [
            {
              OR: [
                { endDate: null },
                { endDate: { gte: new Date() } },
              ],
            },
          ],
        },
        include: {
          feeStructure: {
            include: { feeItems: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (specialRate) {
        isSpecialRate = true;
      }
    }

    // 5. Resolve Line Items: from input items OR special rate OR originating FeeStructure
    let lineItems: Array<{ description: string; unitAmountKobo: bigint; quantity: number; totalAmountKobo: bigint }> = [];

    if (validated.items && validated.items.length > 0) {
      lineItems = validated.items.map((item) => {
        const unit = parseKoboFromDto(item.unitAmountKobo);
        const qty = item.quantity || 1;
        return {
          description: item.description.trim(),
          unitAmountKobo: unit,
          quantity: qty,
          totalAmountKobo: unit * BigInt(qty),
        };
      });
    } else if (specialRate) {
      if (specialRate.customAmountKobo != null) {
        const label = specialRate.notes
          ? `Approved Special Rate Tuition (${specialRate.notes})`
          : 'Approved Special Rate Tuition';
        lineItems = [
          {
            description: label,
            unitAmountKobo: specialRate.customAmountKobo,
            quantity: 1,
            totalAmountKobo: specialRate.customAmountKobo,
          },
        ];
      } else if (specialRate.feeStructure && specialRate.feeStructure.feeItems.length > 0) {
        lineItems = specialRate.feeStructure.feeItems.map((item) => ({
          description: `${item.name} (Approved Special Rate)`,
          unitAmountKobo: item.amountKobo,
          quantity: 1,
          totalAmountKobo: item.amountKobo,
        }));
      }
    } else if (validated.feeStructureId) {
      const feeStructure = await tx.feeStructure.findUnique({
        where: { id: validated.feeStructureId },
        include: { feeItems: true },
      });

      if (!feeStructure || feeStructure.feeItems.length === 0) {
        throw new AuthorizationError(
          'Specified fee structure has no fee items.',
          400,
          'EMPTY_FEE_STRUCTURE'
        );
      }

      lineItems = feeStructure.feeItems.map((item) => ({
        description: item.name,
        unitAmountKobo: item.amountKobo,
        quantity: 1,
        totalAmountKobo: item.amountKobo,
      }));
    } else {
      // Check program for Creche monthly care fee
      const programme = await tx.programme.findUnique({ where: { id: validated.programmeId } });
      const isCreche = programme?.code === 'CRECHE' || billingMonth > 0;

      // Automatically resolve matching active fee structure
      const resolved = await resolveFeeStructureForStudent(
        {
          studentId: validated.studentId,
          programmeId: validated.programmeId,
          academicSessionId: validated.academicSessionId,
          academicTermId: validated.academicTermId,
        },
        tx
      );

      if (resolved && resolved.feeItems.length > 0) {
        lineItems = resolved.feeItems.map((item) => ({
          description: item.name,
          unitAmountKobo: item.amountKobo,
          quantity: 1,
          totalAmountKobo: item.amountKobo,
        }));
      } else if (isCreche) {
        // Standard Creche monthly tuition fee: ₦10,000 (1,000,000 Kobo)
        const monthName = validated.billingPeriodName || (billingMonth > 0 ? getBillingMonthName(billingMonth) : 'Monthly');
        lineItems = [
          {
            description: `${monthName} Creche Care & Tuition Fee`,
            unitAmountKobo: BigInt(1000000), // ₦10,000 in Kobo
            quantity: 1,
            totalAmountKobo: BigInt(1000000),
          },
        ];
      } else {
        throw new AuthorizationError(
          'No applicable fee structure found to generate invoice line items.',
          400,
          'FEE_STRUCTURE_NOT_FOUND'
        );
      }
    }

    if (lineItems.length === 0) {
      throw new AuthorizationError(
        'Cannot issue invoice with 0 line items.',
        400,
        'EMPTY_INVOICE'
      );
    }

    // 6. Authoritative recalculation of totals on the server
    let totalAmountKobo = BigInt(0);
    for (const item of lineItems) {
      totalAmountKobo += item.totalAmountKobo;
    }

    // 7. Concurrency-safe atomic invoice number allocation
    const invoiceYear = validated.dueDate.getFullYear();
    const invoiceNumber = await getNextInvoiceNumber(tx, invoiceYear);

    // 8. Persist Invoice and frozen line item snapshots
    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber,
        studentId: validated.studentId,
        guardianId,
        academicSessionId: validated.academicSessionId,
        academicTermId: validated.academicTermId,
        programmeId: validated.programmeId,
        feeStructureId: validated.feeStructureId || specialRate?.feeStructureId || null,
        billingMonth,
        billingPeriodName: validated.billingPeriodName || (billingMonth > 0 ? getBillingMonthName(billingMonth) : null),
        isSpecialRate,
        totalAmountKobo,
        amountPaidKobo: BigInt(0),
        outstandingBalanceKobo: totalAmountKobo,
        status: InvoiceStatus.ISSUED,
        dueDate: validated.dueDate,
        issuedAt: new Date(),
        items: {
          create: lineItems.map((item) => ({
            description: item.description,
            unitAmountKobo: item.unitAmountKobo,
            quantity: item.quantity,
            totalAmountKobo: item.totalAmountKobo,
          })),
        },
      },
      include: {
        items: true,
        student: true,
        guardian: true,
        programme: true,
        academicSession: true,
        academicTerm: true,
      },
    });

    // 8. Audit Log
    await tx.auditLog.create({
      data: {
        userId: actor ? actor.id : null,
        action: 'INVOICE_ISSUED',
        entityType: 'Invoice',
        entityId: invoice.id,
        newValues: {
          invoiceNumber: invoice.invoiceNumber,
          studentId: invoice.studentId,
          guardianId: invoice.guardianId,
          totalAmountKobo: invoice.totalAmountKobo.toString(),
          itemCount: invoice.items.length,
        },
      },
    });

    // 9. Enqueue Invoice Issued Notification (FINANCE, mandatory)
    if (invoice.guardian?.email) {
      const guardianName = `${invoice.guardian.firstName} ${invoice.guardian.lastName}`.trim();
      const studentName = `${invoice.student.firstName} ${invoice.student.lastName}`.trim();
      const rendered = renderInvoiceIssuedEmail({
        guardianName,
        studentName,
        invoiceNumber: invoice.invoiceNumber,
        totalAmountKobo: invoice.totalAmountKobo,
        dueDateFormatted: invoice.dueDate.toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos' }),
      });

      await enqueueNotification(
        {
          idempotencyKey: `FINANCE:INVOICE_ISSUED:${invoice.id}:${invoice.invoiceNumber}`,
          recipientEmail: invoice.guardian.email,
          channel: 'EMAIL',
          category: NotificationCategory.FINANCE,
          templateName: 'INVOICE_ISSUED',
          subject: rendered.subject,
          bodyText: rendered.text,
          htmlBody: rendered.html,
          metadata: {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            studentId: invoice.studentId,
          },
        },
        tx
      );
    }

    // 10. Administrative In-App Alert for Super Admin & Finance Staff
    const guardianDisplayName = invoice.guardian
      ? `${invoice.guardian.firstName} ${invoice.guardian.lastName}`.trim()
      : 'Guardian';
    const studentDisplayName = invoice.student
      ? `${invoice.student.firstName} ${invoice.student.lastName}`.trim()
      : 'Student';

    await tx.notification.create({
      data: {
        idempotencyKey: `ADMIN_NOTIF:INVOICE_ISSUED:${invoice.id}`,
        recipientUserId: null,
        recipientEmail: null,
        channel: NotificationChannel.EMAIL,
        category: NotificationCategory.FINANCE,
        templateName: 'ADMIN_FINANCIAL_ALERT',
        subject: `New Invoice Issued: ${invoice.invoiceNumber} — ₦${(Number(invoice.totalAmountKobo) / 100).toLocaleString()}`,
        bodyText: `Invoice ${invoice.invoiceNumber} issued for ${studentDisplayName}.\nPayer: ${guardianDisplayName} (${invoice.guardian?.email || 'N/A'})\nAmount: ₦${(Number(invoice.totalAmountKobo) / 100).toLocaleString()}\nDue Date: ${invoice.dueDate.toLocaleDateString('en-GB')}`,
        status: NotificationStatus.DELIVERED,
        sentAt: new Date(),
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          studentName: studentDisplayName,
          guardianName: guardianDisplayName,
          guardianEmail: invoice.guardian?.email,
          amountKobo: invoice.totalAmountKobo.toString(),
          status: 'ISSUED',
          linkUrl: `/admin/finance/invoices/${invoice.id}`,
        },
      },
    });

    return invoice;
  };

  if ('$transaction' in client) {
    return (client as typeof prisma).$transaction(execute);
  }
  return execute(client as Prisma.TransactionClient);
}

/**
 * Generates batch school-fee invoices for all enrolled students in a programme / class.
 * Idempotently skips students who already have an invoice for the term.
 */
export async function generateBatchTermInvoices(
  actor: SafeUser,
  input: BatchInvoiceGenerationInput,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  await requirePermission(actor, PermissionCode.FINANCE_INVOICE_MANAGE);
  const validated = BatchInvoiceGenerationSchema.parse(input);

  const execute = async (tx: Prisma.TransactionClient) => {
    // 1. Locate all active student enrollments for target session, term, programme
    const enrollments = await tx.studentProgrammeEnrollment.findMany({
      where: {
        academicSessionId: validated.academicSessionId,
        academicTermId: validated.academicTermId,
        programmeId: validated.programmeId,
        enrollmentStatus: 'ACTIVE',
        ...(validated.schoolClassId && { schoolClassId: validated.schoolClassId }),
      },
      include: {
        student: {
          include: {
            guardianLinks: {
              where: { status: 'ACTIVE' },
              include: { guardian: true },
            },
          },
        },
      },
    });

    const results = {
      totalEligible: enrollments.length,
      createdCount: 0,
      skippedExistingCount: 0,
      skippedNoGuardianCount: 0,
      skippedNoFeeStructureCount: 0,
      createdInvoices: [] as string[],
    };

    const billingMonth = validated.billingMonth ?? 0;

    for (const enrollment of enrollments) {
      // Check if student already has an invoice for this term & programme & billingMonth
      const existing = await tx.invoice.findUnique({
        where: {
          unique_student_programme_term_invoice: {
            studentId: enrollment.studentId,
            programmeId: enrollment.programmeId,
            academicSessionId: enrollment.academicSessionId,
            academicTermId: enrollment.academicTermId,
            billingMonth,
          },
        },
      });

      if (existing) {
        results.skippedExistingCount++;
        continue;
      }

      // Check guardian
      const primaryLink =
        enrollment.student.guardianLinks.find((l) => l.receivesInvoices && l.isPrimaryContact) ||
        enrollment.student.guardianLinks.find((l) => l.receivesInvoices) ||
        enrollment.student.guardianLinks[0];

      if (!primaryLink) {
        results.skippedNoGuardianCount++;
        continue;
      }

      // Check if student has special rate
      const hasSpecialRate = await tx.studentSpecialFeeRate.findFirst({
        where: {
          studentId: enrollment.studentId,
          programmeId: enrollment.programmeId,
          academicSessionId: enrollment.academicSessionId,
          isActive: true,
          OR: [
            { academicTermId: null },
            { academicTermId: enrollment.academicTermId },
          ],
          AND: [
            {
              OR: [
                { endDate: null },
                { endDate: { gte: new Date() } },
              ],
            },
          ],
        },
      });

      const programme = await tx.programme.findUnique({ where: { id: enrollment.programmeId } });
      const isCreche = programme?.code === 'CRECHE' || billingMonth > 0;

      // Resolve fee structure
      let feeStructureId: string | null = null;
      if (!hasSpecialRate) {
        const feeStructure = await resolveFeeStructureForStudent(
          {
            studentId: enrollment.studentId,
            programmeId: enrollment.programmeId,
            academicSessionId: enrollment.academicSessionId,
            academicTermId: enrollment.academicTermId,
            schoolClassId: enrollment.schoolClassId,
            isAdmissionFee: validated.isAdmissionFee,
          },
          tx
        );

        if ((!feeStructure || feeStructure.feeItems.length === 0) && !isCreche) {
          results.skippedNoFeeStructureCount++;
          continue;
        }
        feeStructureId = feeStructure?.id ?? null;
      }

      // Create invoice
      const invoice = await createInvoice(
        actor,
        {
          studentId: enrollment.studentId,
          guardianId: primaryLink.guardianId,
          academicSessionId: enrollment.academicSessionId,
          academicTermId: enrollment.academicTermId,
          programmeId: enrollment.programmeId,
          feeStructureId,
          dueDate: validated.dueDate,
          billingMonth,
          billingPeriodName: validated.billingPeriodName,
        },
        tx
      );

      results.createdCount++;
      results.createdInvoices.push(invoice.invoiceNumber);
    }

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'BATCH_INVOICES_GENERATED',
        entityType: 'Invoice',
        entityId: validated.academicTermId,
        newValues: {
          programmeId: validated.programmeId,
          schoolClassId: validated.schoolClassId,
          ...results,
        },
      },
    });

    return results;
  };

  if ('$transaction' in client) {
    return (client as typeof prisma).$transaction(execute);
  }
  return execute(client as Prisma.TransactionClient);
}

/**
 * Cancels an unpaid invoice.
 * Invariant: Strictly rejects cancelling an invoice that has recorded payments.
 */
export async function cancelInvoice(
  actor: SafeUser,
  invoiceId: string,
  reason: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  await requirePermission(actor, PermissionCode.FINANCE_INVOICE_MANAGE);

  if (!reason || reason.trim().length === 0) {
    throw new AuthorizationError('Cancellation reason is required.', 400, 'REASON_REQUIRED');
  }

  const execute = async (tx: Prisma.TransactionClient) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: { payments: true },
    });

    if (!invoice) {
      throw new AuthorizationError('Invoice not found.', 404, 'INVOICE_NOT_FOUND');
    }

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new AuthorizationError('Invoice is already cancelled.', 400, 'ALREADY_CANCELLED');
    }

    // Invariant: cannot cancel if any payments recorded (even if pending or confirmed)
    if (invoice.amountPaidKobo > BigInt(0) || invoice.payments.length > 0) {
      throw new AuthorizationError(
        'Cannot cancel an invoice with recorded payments. Reverse payments before cancelling.',
        400,
        'INVOICE_HAS_PAYMENTS'
      );
    }

    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.CANCELLED,
        outstandingBalanceKobo: BigInt(0),
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'INVOICE_CANCELLED',
        entityType: 'Invoice',
        entityId: invoice.id,
        oldValues: {
          status: invoice.status,
          outstandingBalanceKobo: invoice.outstandingBalanceKobo.toString(),
        },
        newValues: {
          status: updated.status,
          outstandingBalanceKobo: updated.outstandingBalanceKobo.toString(),
          reason: reason.trim(),
        },
      },
    });

    return updated;
  };

  if ('$transaction' in client) {
    return (client as typeof prisma).$transaction(execute);
  }
  return execute(client as Prisma.TransactionClient);
}

/**
 * Retrieves invoice by ID with items, payments, allocations, and receipts.
 * Enforces RBAC & parent-child scoping.
 */
export async function getInvoiceById(
  actor: SafeUser,
  invoiceId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const roles = await getUserRoles(actor.id);
  const isFinanceStaff =
    roles.includes(RoleCode.ACCOUNTANT) ||
    roles.includes(RoleCode.SUPER_ADMIN) ||
    roles.includes(RoleCode.ADMIN);

  const isParent = roles.includes(RoleCode.PARENT);

  if (!isFinanceStaff && !isParent) {
    throw new AuthorizationError('Not authorized to view invoices.', 403, 'FORBIDDEN');
  }

  const invoice = await client.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      items: true,
      payments: {
        include: {
          receipt: true,
          allocations: true,
          recordedByUser: { select: { id: true, email: true } },
          reconciledByUser: { select: { id: true, email: true } },
          reversedByUser: { select: { id: true, email: true } },
        },
      },
      allocations: true,
      receipts: true,
      student: true,
      guardian: true,
      programme: true,
      academicSession: true,
      academicTerm: true,
    },
  });

  if (!invoice) {
    throw new AuthorizationError('Invoice not found.', 404, 'INVOICE_NOT_FOUND');
  }

  // If Parent, enforce that the invoice belongs to one of their active linked children
  if (isParent && !isFinanceStaff) {
    const parentGuardian = await client.guardian.findUnique({
      where: { userId: actor.id },
      include: {
        relationships: {
          where: { status: 'ACTIVE' },
        },
      },
    });

    if (!parentGuardian) {
      throw new AuthorizationError('Parent guardian profile not found.', 403, 'FORBIDDEN');
    }

    const linkedStudentIds = parentGuardian.relationships.map((r) => r.studentId);
    if (!linkedStudentIds.includes(invoice.studentId)) {
      throw new AuthorizationError(
        'Access denied: You can only view invoices belonging to your linked children.',
        403,
        'CHILD_SCOPE_VIOLATION'
      );
    }
  }

  return invoice;
}

/**
 * Lists invoices with filtering and scope enforcement.
 */
export async function listInvoices(
  actor: SafeUser,
  filters: {
    academicSessionId?: string;
    academicTermId?: string;
    programmeId?: string;
    studentId?: string;
    guardianId?: string;
    status?: InvoiceStatus;
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
    throw new AuthorizationError('Not authorized to view invoices.', 403, 'FORBIDDEN');
  }

  let allowedStudentIds: string[] | undefined = undefined;

  if (isParent && !isFinanceStaff) {
    const parentGuardian = await client.guardian.findUnique({
      where: { userId: actor.id },
      include: {
        relationships: {
          where: { status: 'ACTIVE' },
        },
      },
    });

    if (!parentGuardian) {
      return [];
    }

    allowedStudentIds = parentGuardian.relationships.map((r) => r.studentId);

    // If client tampered with studentId not belonging to their children, reject
    if (filters.studentId && !allowedStudentIds.includes(filters.studentId)) {
      throw new AuthorizationError(
        'Access denied: Cannot query invoices for an unrelated student.',
        403,
        'CHILD_SCOPE_VIOLATION'
      );
    }
  }

  return client.invoice.findMany({
    where: {
      ...(filters.academicSessionId && { academicSessionId: filters.academicSessionId }),
      ...(filters.academicTermId && { academicTermId: filters.academicTermId }),
      ...(filters.programmeId && { programmeId: filters.programmeId }),
      ...(filters.status && { status: filters.status }),
      ...(filters.guardianId && { guardianId: filters.guardianId }),
      ...(filters.studentId
        ? { studentId: filters.studentId }
        : allowedStudentIds
        ? { studentId: { in: allowedStudentIds } }
        : {}),
    },
    include: {
      items: true,
      student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } },
      guardian: { select: { id: true, firstName: true, lastName: true, phonePrimary: true } },
      programme: { select: { id: true, name: true, code: true } },
      academicSession: { select: { id: true, name: true } },
      academicTerm: { select: { id: true, name: true, termCode: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}
