import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthorizationError } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';

/**
 * Swanford Academy — Programme Management Service
 * Master Specification Reference: Sections 3, 5, 6
 *
 * Invariants:
 * - Tahfeez is a first-class Programme, NOT an isolated subsystem.
 * - Programmes support soft-deactivation (isActive = false) for historical readability.
 * - Deletion is blocked if dependent classes or enrollments exist.
 * - Programme codes are fully dynamic and database-driven (e.g. NURSERY, PRIMARY, TAHFEEZ, SECONDARY).
 */

export const CreateProgrammeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Code must be at least 2 characters')
    .max(30, 'Code cannot exceed 30 characters')
    .regex(/^[A-Za-z0-9_]+$/, 'Code can only contain letters, numbers, and underscores')
    .transform((val) => val.toUpperCase()),
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  isMainAcademic: z.boolean().default(true),
  description: z.string().optional(),
  displayOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const UpdateProgrammeSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export type CreateProgrammeInput = z.input<typeof CreateProgrammeSchema>;
export type UpdateProgrammeInput = z.input<typeof UpdateProgrammeSchema>;

export async function listProgrammes(options?: { includeInactive?: boolean }) {
  return prisma.programme.findMany({
    where: options?.includeInactive ? undefined : { isActive: true },
    orderBy: { displayOrder: 'asc' },
    include: {
      classes: {
        where: options?.includeInactive ? undefined : { isActive: true },
        orderBy: { displayOrder: 'asc' },
      },
      subjects: {
        where: options?.includeInactive ? undefined : { isActive: true },
        orderBy: { displayOrder: 'asc' },
      },
    },
  });
}

export async function getProgramme(id: string) {
  const programme = await prisma.programme.findUnique({
    where: { id },
    include: {
      classes: { orderBy: { displayOrder: 'asc' } },
      subjects: { orderBy: { displayOrder: 'asc' } },
      gradingScales: true,
    },
  });

  if (!programme) {
    throw new AuthorizationError('Programme not found.', 404, 'PROGRAMME_NOT_FOUND');
  }

  return programme;
}

export async function createProgramme(
  actorUserId: string,
  input: CreateProgrammeInput
) {
  await requirePermission(actorUserId, PermissionCode.PROGRAMME_MANAGE);

  const validated = CreateProgrammeSchema.parse(input);

  const existing = await prisma.programme.findUnique({
    where: { code: validated.code },
  });
  if (existing) {
    throw new AuthorizationError(
      `A programme with code '${validated.code}' already exists.`,
      400,
      'DUPLICATE_PROGRAMME_CODE'
    );
  }

  return prisma.$transaction(async (tx) => {
    const prog = await tx.programme.create({
      data: validated,
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'PROGRAMME_CREATED',
        entityType: 'Programme',
        entityId: prog.id,
        newValues: {
          code: prog.code,
          name: prog.name,
          isMainAcademic: prog.isMainAcademic,
        },
      },
    });

    return prog;
  });
}

export async function updateProgramme(
  actorUserId: string,
  id: string,
  input: UpdateProgrammeInput
) {
  await requirePermission(actorUserId, PermissionCode.PROGRAMME_MANAGE);

  const validated = UpdateProgrammeSchema.parse(input);
  const prog = await getProgramme(id);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.programme.update({
      where: { id },
      data: validated,
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'PROGRAMME_UPDATED',
        entityType: 'Programme',
        entityId: id,
        oldValues: {
          name: prog.name,
          isActive: prog.isActive,
          displayOrder: prog.displayOrder,
        },
        newValues: {
          name: updated.name,
          isActive: updated.isActive,
          displayOrder: updated.displayOrder,
        },
      },
    });

    return updated;
  });
}

export async function deactivateProgramme(actorUserId: string, id: string) {
  return updateProgramme(actorUserId, id, { isActive: false });
}

export async function deleteProgramme(actorUserId: string, id: string) {
  await requirePermission(actorUserId, PermissionCode.PROGRAMME_MANAGE);

  const prog = await getProgramme(id);

  const [classCount, enrollmentCount, feeCount, appCount] = await Promise.all([
    prisma.schoolClass.count({ where: { programmeId: id } }),
    prisma.studentProgrammeEnrollment.count({ where: { programmeId: id } }),
    prisma.feeStructure.count({ where: { programmeId: id } }),
    prisma.applicationProgrammeSelection.count({ where: { programmeId: id } }),
  ]);

  const totalDependencies = classCount + enrollmentCount + feeCount + appCount;
  if (totalDependencies > 0) {
    throw new AuthorizationError(
      `Cannot delete programme '${prog.name}': ${totalDependencies} dependent record(s) exist. Deactivate the programme instead.`,
      400,
      'PROGRAMME_HAS_DEPENDENTS'
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.programme.delete({
      where: { id },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'PROGRAMME_DELETED',
        entityType: 'Programme',
        entityId: id,
        oldValues: {
          code: prog.code,
          name: prog.name,
        },
      },
    });
  });
}
