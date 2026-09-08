import { prisma } from '@/lib/prisma';
import { ExpenseStatus, PaymentMethod, Prisma, RoleCode } from '@prisma/client';
import { requirePermission, AuthorizationError, getUserRoles } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { SafeUser } from '@/lib/auth/service';
import { parseKoboFromDto } from '@/lib/money';
import { getNextExpenseNumber } from './sequences';
import { z } from 'zod';

export const CreateExpenseCategorySchema = z.object({
  code: z.string().min(2).max(50).toUpperCase(),
  name: z.string().min(2).max(100),
  description: z.string().max(250).optional(),
});

export type CreateExpenseCategoryInput = z.infer<typeof CreateExpenseCategorySchema>;

export const RecordExpenseSchema = z.object({
  categoryId: z.string().uuid(),
  academicSessionId: z.string().uuid(),
  academicTermId: z.string().uuid().optional().nullable(),
  title: z.string().min(1).max(150),
  description: z.string().min(1).max(500),
  amountKobo: z.union([z.string(), z.number(), z.bigint()]).refine(
    (val) => {
      try {
        return BigInt(val) > BigInt(0);
      } catch {
        return false;
      }
    },
    { message: 'Expense amount must be greater than 0 Kobo' }
  ),
  paymentMethod: z.nativeEnum(PaymentMethod),
  payeeName: z.string().min(1).max(150),
  receiptVoucherUrl: z.string().url().optional().nullable(),
  expenseDate: z.coerce.date(),
});

export type RecordExpenseInput = z.infer<typeof RecordExpenseSchema>;

/**
 * Creates an expense category.
 */
export async function createExpenseCategory(
  actor: SafeUser,
  input: CreateExpenseCategoryInput,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  await requirePermission(actor, PermissionCode.FINANCE_EXPENSE_MANAGE);
  const validated = CreateExpenseCategorySchema.parse(input);

  const existing = await client.expenseCategory.findUnique({
    where: { code: validated.code },
  });
  if (existing) {
    throw new AuthorizationError('Expense category with this code already exists.', 400, 'DUPLICATE_CODE');
  }

  return client.expenseCategory.create({
    data: {
      code: validated.code,
      name: validated.name.trim(),
      description: validated.description?.trim() || null,
    },
  });
}

/**
 * Lists active expense categories.
 */
export async function listExpenseCategories(
  actor: SafeUser,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const roles = await getUserRoles(actor.id);
  if (
    !roles.includes(RoleCode.ACCOUNTANT) &&
    !roles.includes(RoleCode.SUPER_ADMIN) &&
    !roles.includes(RoleCode.ADMIN)
  ) {
    throw new AuthorizationError('Not authorized to view expense categories.', 403, 'FORBIDDEN');
  }

  return client.expenseCategory.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
}

/**
 * Records an operational school expense with EXP-YYYY-NNNNN sequential voucher numbering.
 */
export async function recordExpense(
  actor: SafeUser,
  input: RecordExpenseInput,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  await requirePermission(actor, PermissionCode.FINANCE_EXPENSE_MANAGE);
  const validated = RecordExpenseSchema.parse(input);
  const expenseKobo = parseKoboFromDto(validated.amountKobo);

  const execute = async (tx: Prisma.TransactionClient) => {
    // 1. Verify Category
    const category = await tx.expenseCategory.findUnique({
      where: { id: validated.categoryId },
    });
    if (!category || !category.isActive) {
      throw new AuthorizationError('Invalid or inactive expense category.', 400, 'INVALID_CATEGORY');
    }

    // 2. Concurrency-safe atomic Expense Number allocation (EXP-YYYY-NNNNN)
    const expenseYear = validated.expenseDate.getFullYear();
    const expenseNumber = await getNextExpenseNumber(tx, expenseYear);

    // 3. Create Expense
    const expense = await tx.expense.create({
      data: {
        expenseNumber,
        categoryId: validated.categoryId,
        academicSessionId: validated.academicSessionId,
        academicTermId: validated.academicTermId || null,
        title: validated.title.trim(),
        description: validated.description.trim(),
        amountKobo: expenseKobo,
        paymentMethod: validated.paymentMethod,
        payeeName: validated.payeeName.trim(),
        receiptVoucherUrl: validated.receiptVoucherUrl || null,
        recordedByUserId: actor.id,
        expenseDate: validated.expenseDate,
        status: ExpenseStatus.RECORDED,
      },
      include: {
        category: true,
        academicSession: true,
        academicTerm: true,
        recordedByUser: { select: { id: true, email: true } },
      },
    });

    // 4. Audit Log
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'EXPENSE_RECORDED',
        entityType: 'Expense',
        entityId: expense.id,
        newValues: {
          expenseNumber: expense.expenseNumber,
          title: expense.title,
          amountKobo: expense.amountKobo.toString(),
          payeeName: expense.payeeName,
          category: category.name,
        },
      },
    });

    return expense;
  };

  if ('$transaction' in client) {
    return (client as typeof prisma).$transaction(execute);
  }
  return execute(client as Prisma.TransactionClient);
}

/**
 * Voids an expense record while strictly preserving financial ledger history.
 */
export async function voidExpense(
  actor: SafeUser,
  expenseId: string,
  reason: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  await requirePermission(actor, PermissionCode.FINANCE_EXPENSE_MANAGE);

  if (!reason || reason.trim().length === 0) {
    throw new AuthorizationError('Void reason is required.', 400, 'REASON_REQUIRED');
  }

  const execute = async (tx: Prisma.TransactionClient) => {
    const expense = await tx.expense.findUnique({
      where: { id: expenseId },
    });

    if (!expense) {
      throw new AuthorizationError('Expense not found.', 404, 'EXPENSE_NOT_FOUND');
    }

    if (expense.status === ExpenseStatus.VOIDED) {
      throw new AuthorizationError('Expense is already voided.', 400, 'ALREADY_VOIDED');
    }

    const updated = await tx.expense.update({
      where: { id: expenseId },
      data: { status: ExpenseStatus.VOIDED },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'EXPENSE_VOIDED',
        entityType: 'Expense',
        entityId: expense.id,
        oldValues: { status: expense.status },
        newValues: { status: updated.status, reason: reason.trim() },
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
 * Lists operational expenses with filters.
 */
export async function listExpenses(
  actor: SafeUser,
  filters: {
    academicSessionId?: string;
    academicTermId?: string;
    categoryId?: string;
    status?: ExpenseStatus;
    startDate?: Date;
    endDate?: Date;
  },
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const roles = await getUserRoles(actor.id);
  if (
    !roles.includes(RoleCode.ACCOUNTANT) &&
    !roles.includes(RoleCode.SUPER_ADMIN) &&
    !roles.includes(RoleCode.ADMIN)
  ) {
    throw new AuthorizationError('Not authorized to view expenses.', 403, 'FORBIDDEN');
  }

  return client.expense.findMany({
    where: {
      ...(filters.academicSessionId && { academicSessionId: filters.academicSessionId }),
      ...(filters.academicTermId && { academicTermId: filters.academicTermId }),
      ...(filters.categoryId && { categoryId: filters.categoryId }),
      ...(filters.status && { status: filters.status }),
      ...(filters.startDate && { expenseDate: { gte: filters.startDate } }),
      ...(filters.endDate && { expenseDate: { lte: filters.endDate } }),
    },
    include: {
      category: true,
      academicSession: true,
      academicTerm: true,
    },
    orderBy: { expenseDate: 'desc' },
  });
}
