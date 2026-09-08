import { prisma } from '@/lib/prisma';
import {
  FeeApplicableGender,
  Gender,
  Prisma,
  RoleCode,
} from '@prisma/client';
import { requirePermission, AuthorizationError, getUserRoles } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { SafeUser } from '@/lib/auth/service';
import { parseKoboFromDto } from '@/lib/money';
import { z } from 'zod';

export const FeeItemInputSchema = z.object({
  name: z.string().min(1, 'Fee item name is required').max(100),
  amountKobo: z.union([z.string(), z.number(), z.bigint()]).refine(
    (val) => {
      try {
        const k = BigInt(val);
        return k >= BigInt(0);
      } catch {
        return false;
      }
    },
    { message: 'Amount in Kobo must be a non-negative integer' }
  ),
});

export const CreateFeeStructureSchema = z.object({
  academicSessionId: z.string().uuid(),
  academicTermId: z.string().uuid(),
  programmeId: z.string().uuid(),
  schoolClassId: z.string().uuid().optional().nullable(),
  applicableGender: z.nativeEnum(FeeApplicableGender).default(FeeApplicableGender.ALL),
  isAdmissionFee: z.boolean().default(false),
  name: z.string().min(1, 'Fee structure name is required').max(150),
  feeItems: z.array(FeeItemInputSchema).min(1, 'At least one fee line item is required'),
});

export type CreateFeeStructureInput = z.input<typeof CreateFeeStructureSchema>;

export const UpdateFeeStructureSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  isActive: z.boolean().optional(),
  feeItems: z.array(FeeItemInputSchema).optional(),
});

export type UpdateFeeStructureInput = z.input<typeof UpdateFeeStructureSchema>;

/**
 * Creates a new academic FeeStructure with itemized line items.
 * Master Specification Reference: Sections 6, 15, 24
 */
export async function createFeeStructure(
  actor: SafeUser,
  input: CreateFeeStructureInput,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  await requirePermission(actor, PermissionCode.FEE_STRUCTURE_MANAGE);
  const validated = CreateFeeStructureSchema.parse(input);

  const execute = async (tx: Prisma.TransactionClient) => {
    // 1. Verify Academic Term belongs to Academic Session
    const term = await tx.academicTerm.findUnique({
      where: { id: validated.academicTermId },
    });
    if (!term || term.academicSessionId !== validated.academicSessionId) {
      throw new AuthorizationError(
        'Selected Academic Term does not belong to the Academic Session.',
        400,
        'INVALID_TERM_SESSION'
      );
    }

    // 2. Verify Programme exists
    const programme = await tx.programme.findUnique({
      where: { id: validated.programmeId },
    });
    if (!programme) {
      throw new AuthorizationError('Programme not found.', 404, 'PROGRAMME_NOT_FOUND');
    }

    // 3. If schoolClassId specified, verify it belongs to the programme
    if (validated.schoolClassId) {
      const schoolClass = await tx.schoolClass.findUnique({
        where: { id: validated.schoolClassId },
      });
      if (!schoolClass || schoolClass.programmeId !== validated.programmeId) {
        throw new AuthorizationError(
          'Specified school class does not belong to the selected programme.',
          400,
          'INVALID_CLASS_PROGRAMME'
        );
      }
    }

    // 4. Create FeeStructure and nested FeeItems
    const feeStructure = await tx.feeStructure.create({
      data: {
        academicSessionId: validated.academicSessionId,
        academicTermId: validated.academicTermId,
        programmeId: validated.programmeId,
        schoolClassId: validated.schoolClassId || null,
        applicableGender: validated.applicableGender,
        isAdmissionFee: validated.isAdmissionFee,
        name: validated.name.trim(),
        isActive: true,
        feeItems: {
          create: validated.feeItems.map((item) => ({
            name: item.name.trim(),
            amountKobo: parseKoboFromDto(item.amountKobo),
          })),
        },
      },
      include: {
        feeItems: true,
        academicSession: true,
        academicTerm: true,
        programme: true,
        schoolClass: true,
      },
    });

    // 5. Immutable Audit Log
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'FEE_STRUCTURE_CREATED',
        entityType: 'FeeStructure',
        entityId: feeStructure.id,
        newValues: {
          name: feeStructure.name,
          programmeId: feeStructure.programmeId,
          academicSessionId: feeStructure.academicSessionId,
          academicTermId: feeStructure.academicTermId,
          isAdmissionFee: feeStructure.isAdmissionFee,
          applicableGender: feeStructure.applicableGender,
          itemCount: feeStructure.feeItems.length,
        },
      },
    });

    return feeStructure;
  };

  if ('$transaction' in client) {
    return (client as typeof prisma).$transaction(execute);
  }
  return execute(client as Prisma.TransactionClient);
}

/**
 * Updates fee structure metadata or replaces line items for future billings.
 * Note: Historical invoices snapshotted from this fee structure are completely unaffected.
 */
export async function updateFeeStructure(
  actor: SafeUser,
  id: string,
  input: UpdateFeeStructureInput,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  await requirePermission(actor, PermissionCode.FEE_STRUCTURE_MANAGE);
  const validated = UpdateFeeStructureSchema.parse(input);

  const execute = async (tx: Prisma.TransactionClient) => {
    const existing = await tx.feeStructure.findUnique({
      where: { id },
      include: { feeItems: true },
    });

    if (!existing) {
      throw new AuthorizationError('Fee structure not found.', 404, 'FEE_STRUCTURE_NOT_FOUND');
    }

    if (validated.feeItems) {
      // Replace line items
      await tx.feeItem.deleteMany({
        where: { feeStructureId: id },
      });

      await tx.feeItem.createMany({
        data: validated.feeItems.map((item) => ({
          feeStructureId: id,
          name: item.name.trim(),
          amountKobo: parseKoboFromDto(item.amountKobo),
        })),
      });
    }

    const updated = await tx.feeStructure.update({
      where: { id },
      data: {
        ...(validated.name !== undefined && { name: validated.name.trim() }),
        ...(validated.isActive !== undefined && { isActive: validated.isActive }),
      },
      include: {
        feeItems: true,
        academicSession: true,
        academicTerm: true,
        programme: true,
        schoolClass: true,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'FEE_STRUCTURE_UPDATED',
        entityType: 'FeeStructure',
        entityId: updated.id,
        oldValues: {
          name: existing.name,
          isActive: existing.isActive,
          itemCount: existing.feeItems.length,
        },
        newValues: {
          name: updated.name,
          isActive: updated.isActive,
          itemCount: updated.feeItems.length,
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
 * Resolves the matching FeeStructure for a student based on session, term, programme, class, gender, and admission flag.
 */
export async function resolveFeeStructureForStudent(
  params: {
    studentId: string;
    programmeId: string;
    academicSessionId: string;
    academicTermId: string;
    schoolClassId?: string | null;
    isAdmissionFee?: boolean;
  },
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const student = await client.student.findUnique({
    where: { id: params.studentId },
  });

  if (!student) {
    throw new AuthorizationError('Student not found.', 404, 'STUDENT_NOT_FOUND');
  }

  const genderFilter =
    student.gender === Gender.MALE
      ? [FeeApplicableGender.MALE, FeeApplicableGender.ALL]
      : [FeeApplicableGender.FEMALE, FeeApplicableGender.ALL];

  // 1. Try class-specific fee structure first if classId provided
  if (params.schoolClassId) {
    const classSpecific = await client.feeStructure.findFirst({
      where: {
        academicSessionId: params.academicSessionId,
        academicTermId: params.academicTermId,
        programmeId: params.programmeId,
        schoolClassId: params.schoolClassId,
        applicableGender: { in: genderFilter },
        isAdmissionFee: params.isAdmissionFee ?? false,
        isActive: true,
      },
      include: { feeItems: true },
      orderBy: { createdAt: 'desc' },
    });

    if (classSpecific) return classSpecific;
  }

  // 2. Fall back to programme-wide fee structure (schoolClassId = null)
  return client.feeStructure.findFirst({
    where: {
      academicSessionId: params.academicSessionId,
      academicTermId: params.academicTermId,
      programmeId: params.programmeId,
      schoolClassId: null,
      applicableGender: { in: genderFilter },
      isAdmissionFee: params.isAdmissionFee ?? false,
      isActive: true,
    },
    include: { feeItems: true },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Clones fee structures from one academic term to a target session and term.
 */
export async function cloneFeeStructures(
  actor: SafeUser,
  input: {
    sourceSessionId: string;
    sourceTermId: string;
    targetSessionId: string;
    targetTermId: string;
  },
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  await requirePermission(actor, PermissionCode.FEE_STRUCTURE_MANAGE);

  const execute = async (tx: Prisma.TransactionClient) => {
    const sources = await tx.feeStructure.findMany({
      where: {
        academicSessionId: input.sourceSessionId,
        academicTermId: input.sourceTermId,
        isActive: true,
      },
      include: { feeItems: true },
    });

    if (sources.length === 0) {
      throw new AuthorizationError(
        'No active fee structures found in the source term to clone.',
        400,
        'NO_SOURCE_FEE_STRUCTURES'
      );
    }

    const cloned = [];
    for (const src of sources) {
      const newStructure = await tx.feeStructure.create({
        data: {
          academicSessionId: input.targetSessionId,
          academicTermId: input.targetTermId,
          programmeId: src.programmeId,
          schoolClassId: src.schoolClassId,
          applicableGender: src.applicableGender,
          isAdmissionFee: src.isAdmissionFee,
          name: src.name,
          isActive: true,
          feeItems: {
            create: src.feeItems.map((item) => ({
              name: item.name,
              amountKobo: item.amountKobo,
            })),
          },
        },
        include: { feeItems: true },
      });
      cloned.push(newStructure);
    }

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'FEE_STRUCTURES_CLONED',
        entityType: 'FeeStructure',
        entityId: input.targetTermId,
        newValues: {
          sourceSessionId: input.sourceSessionId,
          sourceTermId: input.sourceTermId,
          targetSessionId: input.targetSessionId,
          targetTermId: input.targetTermId,
          clonedCount: cloned.length,
        },
      },
    });

    return cloned;
  };

  if ('$transaction' in client) {
    return (client as typeof prisma).$transaction(execute);
  }
  return execute(client as Prisma.TransactionClient);
}

export async function listFeeStructures(
  actor: SafeUser,
  filters: {
    academicSessionId?: string;
    academicTermId?: string;
    programmeId?: string;
    schoolClassId?: string;
    isAdmissionFee?: boolean;
    isActive?: boolean;
  },
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  // Can be viewed by Accountant, Super Admin, or Admin
  const roles = await getUserRoles(actor.id);
  if (
    !roles.includes(RoleCode.ACCOUNTANT) &&
    !roles.includes(RoleCode.SUPER_ADMIN) &&
    !roles.includes(RoleCode.ADMIN)
  ) {
    throw new AuthorizationError(
      'Not authorized to view fee structures.',
      403,
      'FORBIDDEN'
    );
  }

  return client.feeStructure.findMany({
    where: {
      ...(filters.academicSessionId && { academicSessionId: filters.academicSessionId }),
      ...(filters.academicTermId && { academicTermId: filters.academicTermId }),
      ...(filters.programmeId && { programmeId: filters.programmeId }),
      ...(filters.schoolClassId && { schoolClassId: filters.schoolClassId }),
      ...(filters.isAdmissionFee !== undefined && { isAdmissionFee: filters.isAdmissionFee }),
      ...(filters.isActive !== undefined && { isActive: filters.isActive }),
    },
    include: {
      feeItems: true,
      academicSession: true,
      academicTerm: true,
      programme: true,
      schoolClass: true,
    },
    orderBy: [{ programmeId: 'asc' }, { name: 'asc' }],
  });
}

export async function getFeeStructureById(
  actor: SafeUser,
  id: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const roles = await getUserRoles(actor.id);
  if (
    !roles.includes(RoleCode.ACCOUNTANT) &&
    !roles.includes(RoleCode.SUPER_ADMIN) &&
    !roles.includes(RoleCode.ADMIN)
  ) {
    throw new AuthorizationError('Not authorized to view fee structure.', 403, 'FORBIDDEN');
  }

  const structure = await client.feeStructure.findUnique({
    where: { id },
    include: {
      feeItems: true,
      academicSession: true,
      academicTerm: true,
      programme: true,
      schoolClass: true,
    },
  });

  if (!structure) {
    throw new AuthorizationError('Fee structure not found.', 404, 'FEE_STRUCTURE_NOT_FOUND');
  }

  return structure;
}
