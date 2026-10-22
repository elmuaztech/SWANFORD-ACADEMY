import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { requirePermission, AuthorizationError } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { SafeUser } from '@/lib/auth/service';
import { z } from 'zod';
import { parseKoboFromDto } from '@/lib/money';
import { getNextInvoiceNumber } from './sequences';

export const AssignSpecialRatesSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1, 'Select at least one student'),
  programmeId: z.string().uuid(),
  academicSessionId: z.string().uuid(),
  academicTermId: z.string().uuid().optional().nullable(),
  feeStructureId: z.string().uuid().optional().nullable(),
  customAmountNaira: z.union([z.string(), z.number()]).optional().nullable(),
  notes: z.string().max(250).optional().nullable(),
  effectiveDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional().nullable(),
  autoIssueInvoice: z.boolean().optional().default(false),
});

export type AssignSpecialRatesInput = z.input<typeof AssignSpecialRatesSchema>;

/**
 * Lists assigned special or grandfathered fee rates, optionally filtered by programme or session.
 */
export async function listSpecialFeeRates(
  actor: SafeUser,
  filters: {
    programmeId?: string;
    academicSessionId?: string;
    studentId?: string;
    isActive?: boolean;
  } = {},
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  await requirePermission(actor, PermissionCode.FINANCE_INVOICE_VIEW);

  return client.studentSpecialFeeRate.findMany({
    where: {
      ...(filters.programmeId && { programmeId: filters.programmeId }),
      ...(filters.academicSessionId && { academicSessionId: filters.academicSessionId }),
      ...(filters.studentId && { studentId: filters.studentId }),
      ...(filters.isActive !== undefined && { isActive: filters.isActive }),
    },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          gender: true,
        },
      },
      programme: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      academicSession: {
        select: {
          id: true,
          name: true,
        },
      },
      academicTerm: {
        select: {
          id: true,
          name: true,
          termCode: true,
        },
      },
      feeStructure: {
        select: {
          id: true,
          name: true,
        },
      },
      assignedByUser: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Assigns approved special/grandfathered fee rates to one or multiple students.
 */
export async function assignSpecialFeeRates(
  actor: SafeUser,
  input: AssignSpecialRatesInput,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  await requirePermission(actor, PermissionCode.FINANCE_INVOICE_MANAGE);
  const validated = AssignSpecialRatesSchema.parse(input);

  // Parse custom amount if provided
  let customAmountKobo: bigint | null = null;
  if (validated.customAmountNaira !== undefined && validated.customAmountNaira !== null && validated.customAmountNaira !== '') {
    const parsedNum = Number(validated.customAmountNaira);
    if (isNaN(parsedNum) || parsedNum < 0) {
      throw new AuthorizationError('Custom fee amount must be a positive number.', 400, 'INVALID_AMOUNT');
    }
    // Convert Naira to Kobo
    customAmountKobo = BigInt(Math.round(parsedNum * 100));
  }

  if (!customAmountKobo && !validated.feeStructureId) {
    throw new AuthorizationError(
      'You must specify either a custom fee amount (₦) or an existing special fee structure.',
      400,
      'SPECIFY_AMOUNT_OR_STRUCTURE'
    );
  }

  const execute = async (tx: Prisma.TransactionClient) => {
    const results = [];

    // Resolve target term for immediate invoice issuance only if requested
    const shouldIssueInvoice = Boolean(validated.academicTermId || validated.autoIssueInvoice);
    const targetTerm = shouldIssueInvoice
      ? (validated.academicTermId
          ? await tx.academicTerm.findUnique({ where: { id: validated.academicTermId } })
          : (await tx.academicTerm.findFirst({
              where: { academicSessionId: validated.academicSessionId, isCurrent: true },
            })) ||
            (await tx.academicTerm.findFirst({
              where: { academicSessionId: validated.academicSessionId },
              orderBy: { startDate: 'asc' },
            })))
      : null;

    for (const studentId of validated.studentIds) {
      // Deactivate any currently active special rate for the same student & programme & session
      await tx.studentSpecialFeeRate.updateMany({
        where: {
          studentId,
          programmeId: validated.programmeId,
          academicSessionId: validated.academicSessionId,
          isActive: true,
        },
        data: {
          isActive: false,
          endDate: new Date(),
        },
      });

      // Create new active special rate record
      const rate = await tx.studentSpecialFeeRate.create({
        data: {
          studentId,
          programmeId: validated.programmeId,
          academicSessionId: validated.academicSessionId,
          academicTermId: validated.academicTermId || null,
          feeStructureId: validated.feeStructureId || null,
          customAmountKobo,
          effectiveDate: validated.effectiveDate || new Date(),
          endDate: validated.endDate || null,
          notes: validated.notes?.trim() || null,
          isActive: true,
          assignedByUserId: actor.id,
        },
        include: {
          student: true,
          programme: true,
        },
      });

      results.push(rate);

      // Immediately issue or update official invoice so parent can view and pay in portal
      if (targetTerm) {
        let invoiceLineItems: Array<{ description: string; amountKobo: bigint }> = [];
        let invoiceTotalKobo = BigInt(0);

        if (customAmountKobo != null) {
          const desc = validated.notes?.trim()
            ? `Approved Special Rate Tuition (${validated.notes.trim()})`
            : 'Approved Special Rate Tuition';
          invoiceLineItems = [{ description: desc, amountKobo: customAmountKobo }];
          invoiceTotalKobo = customAmountKobo;
        } else if (validated.feeStructureId) {
          const fs = await tx.feeStructure.findUnique({
            where: { id: validated.feeStructureId },
            include: { feeItems: true },
          });
          if (fs && fs.feeItems.length > 0) {
            invoiceLineItems = fs.feeItems.map((fi) => ({
              description: `${fi.name} (Approved Special Rate)`,
              amountKobo: fi.amountKobo,
            }));
            invoiceTotalKobo = fs.feeItems.reduce((acc, fi) => acc + fi.amountKobo, BigInt(0));
          }
        }

        if (invoiceLineItems.length > 0) {
          const existingInv = await tx.invoice.findFirst({
            where: {
              studentId,
              programmeId: validated.programmeId,
              academicSessionId: validated.academicSessionId,
              academicTermId: targetTerm.id,
              billingMonth: 0,
            },
          });

          if (existingInv) {
            // Update unpaid existing invoice to reflect the approved rate
            if (existingInv.amountPaidKobo === BigInt(0)) {
              await tx.invoiceItem.deleteMany({ where: { invoiceId: existingInv.id } });
              await tx.invoiceItem.createMany({
                data: invoiceLineItems.map((li) => ({
                  invoiceId: existingInv.id,
                  description: li.description,
                  unitAmountKobo: li.amountKobo,
                  quantity: 1,
                  totalAmountKobo: li.amountKobo,
                })),
              });
              await tx.invoice.update({
                where: { id: existingInv.id },
                data: {
                  totalAmountKobo: invoiceTotalKobo,
                  outstandingBalanceKobo: invoiceTotalKobo,
                  isSpecialRate: true,
                  billingPeriodName: `${targetTerm.name} Special Rate`,
                  status: 'ISSUED',
                },
              });
            }
          } else {
            // Create a new invoice immediately
            const studentRecord = await tx.student.findUnique({
              where: { id: studentId },
              include: {
                guardianLinks: true,
              },
            });
            let guardianId =
              studentRecord?.guardianLinks.find((l) => l.receivesInvoices && l.isPrimaryContact)?.guardianId ||
              studentRecord?.guardianLinks.find((l) => l.receivesInvoices)?.guardianId ||
              studentRecord?.guardianLinks[0]?.guardianId;

            if (!guardianId) {
              const fallbackGuardian = await tx.guardian.findFirst();
              guardianId = fallbackGuardian?.id;
            }

            if (guardianId) {
              const invoiceYear = new Date().getFullYear();
              const invoiceNumber = await getNextInvoiceNumber(tx, invoiceYear);
              const dueDate = new Date();
              dueDate.setDate(dueDate.getDate() + 30);

              await tx.invoice.create({
                data: {
                  invoiceNumber,
                  studentId,
                  guardianId,
                  academicSessionId: validated.academicSessionId,
                  academicTermId: targetTerm.id,
                  programmeId: validated.programmeId,
                  billingMonth: 0,
                  billingPeriodName: `${targetTerm.name} Special Rate`,
                  isSpecialRate: true,
                  totalAmountKobo: invoiceTotalKobo,
                  amountPaidKobo: BigInt(0),
                  outstandingBalanceKobo: invoiceTotalKobo,
                  status: 'ISSUED',
                  dueDate,
                  issuedAt: new Date(),
                  items: {
                    create: invoiceLineItems.map((li) => ({
                      description: li.description,
                      unitAmountKobo: li.amountKobo,
                      quantity: 1,
                      totalAmountKobo: li.amountKobo,
                    })),
                  },
                },
              });
            }
          }
        }
      }
    }

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'SPECIAL_FEE_RATES_ASSIGNED',
        entityType: 'StudentSpecialFeeRate',
        entityId: validated.programmeId,
        newValues: {
          assignedCount: results.length,
          studentIds: validated.studentIds,
          customAmountKobo: customAmountKobo?.toString() || null,
          feeStructureId: validated.feeStructureId,
          notes: validated.notes,
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
 * Toggles or updates the status of an assigned special fee rate.
 */
export async function toggleSpecialFeeRateStatus(
  actor: SafeUser,
  rateId: string,
  isActive: boolean,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  await requirePermission(actor, PermissionCode.FINANCE_INVOICE_MANAGE);

  return client.studentSpecialFeeRate.update({
    where: { id: rateId },
    data: {
      isActive,
      ...(isActive ? { endDate: null } : { endDate: new Date() }),
    },
  });
}
