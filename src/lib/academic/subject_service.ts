import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthorizationError } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { getProgramme } from '@/lib/academic/programme_service';

/**
 * Swanford Academy — Subject Management Service
 * Master Specification Reference: Sections 3, 5, 6
 *
 * Invariants:
 * - Subjects belong to a specific Programme.
 * - Subject codes must be unique.
 * - Soft-deactivation (isActive = false) preferred over destructive deletion.
 */

export const CreateSubjectSchema = z.object({
  programmeId: z.string().uuid('PLEASE SELECT A VALID PROGRAMME.'),
  code: z
    .string()
    .trim()
    .min(2, 'PLEASE ENTER THE SUBJECT CODE CORRECTLY (at least 2 characters).')
    .max(20, 'Subject code cannot exceed 20 characters.')
    .transform((v) => v.toUpperCase())
    .pipe(
      z
        .string()
        .regex(
          /^[A-Z0-9_]+$/,
          'PLEASE ENTER THE SUBJECT CODE CORRECTLY. Use only uppercase letters and numbers (e.g. MATH, ENG101).'
        )
    ),
  name: z.string().trim().min(2, 'PLEASE ENTER A VALID SUBJECT NAME (at least 2 characters).'),
  description: z.string().optional(),
  displayOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const UpdateSubjectSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'PLEASE ENTER THE SUBJECT CODE CORRECTLY (at least 2 characters).')
    .max(20, 'Subject code cannot exceed 20 characters.')
    .transform((v) => v.toUpperCase())
    .pipe(
      z
        .string()
        .regex(
          /^[A-Z0-9_]+$/,
          'PLEASE ENTER THE SUBJECT CODE CORRECTLY. Use only uppercase letters and numbers (e.g. MATH, ENG101).'
        )
    )
    .optional(),
  name: z.string().trim().min(2, 'PLEASE ENTER A VALID SUBJECT NAME (at least 2 characters).').optional(),
  description: z.string().optional(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export type CreateSubjectInput = z.input<typeof CreateSubjectSchema>;
export type UpdateSubjectInput = z.input<typeof UpdateSubjectSchema>;

export async function listSubjects(options?: {
  programmeId?: string;
  includeInactive?: boolean;
}) {
  return prisma.subject.findMany({
    where: {
      ...(options?.programmeId && { programmeId: options.programmeId }),
      ...(!options?.includeInactive && { isActive: true }),
    },
    orderBy: { displayOrder: 'asc' },
    include: {
      programme: true,
    },
  });
}

export async function getSubject(id: string) {
  const subject = await prisma.subject.findUnique({
    where: { id },
    include: {
      programme: true,
      teacherScopes: true,
    },
  });

  if (!subject) {
    throw new AuthorizationError('Subject not found.', 404, 'SUBJECT_NOT_FOUND');
  }

  return subject;
}

export async function createSubject(
  actorUserId: string,
  input: CreateSubjectInput
) {
  await requirePermission(actorUserId, PermissionCode.SUBJECT_MANAGE);

  const validated = CreateSubjectSchema.parse(input);

  const programme = await getProgramme(validated.programmeId);
  if (!programme.isActive) {
    throw new AuthorizationError(
      `Cannot add a subject to inactive programme '${programme.name}'.`,
      400,
      'INACTIVE_PROGRAMME'
    );
  }

  const existing = await prisma.subject.findUnique({
    where: { code: validated.code },
  });
  if (existing) {
    throw new AuthorizationError(
      `A subject with code '${validated.code}' already exists.`,
      400,
      'DUPLICATE_SUBJECT_CODE'
    );
  }

  return prisma.$transaction(async (tx) => {
    const subject = await tx.subject.create({
      data: validated,
      include: { programme: true },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'SUBJECT_CREATED',
        entityType: 'Subject',
        entityId: subject.id,
        newValues: {
          code: subject.code,
          name: subject.name,
          programmeId: subject.programmeId,
        },
      },
    });

    return subject;
  });
}

export async function updateSubject(
  actorUserId: string,
  id: string,
  input: UpdateSubjectInput
) {
  await requirePermission(actorUserId, PermissionCode.SUBJECT_MANAGE);

  const validated = UpdateSubjectSchema.parse(input);
  const subject = await getSubject(id);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.subject.update({
      where: { id },
      data: validated,
      include: { programme: true },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'SUBJECT_UPDATED',
        entityType: 'Subject',
        entityId: id,
        oldValues: {
          name: subject.name,
          isActive: subject.isActive,
        },
        newValues: {
          name: updated.name,
          isActive: updated.isActive,
        },
      },
    });

    return updated;
  });
}

export async function deactivateSubject(actorUserId: string, id: string) {
  return updateSubject(actorUserId, id, { isActive: false });
}

export async function deleteSubject(actorUserId: string, id: string) {
  await requirePermission(actorUserId, PermissionCode.SUBJECT_MANAGE);

  const subject = await getSubject(id);

  const scopeCount = await prisma.teacherScope.count({ where: { subjectId: id } });
  if (scopeCount > 0) {
    throw new AuthorizationError(
      `Cannot delete subject '${subject.name}': ${scopeCount} assigned teacher scope(s) exist. Deactivate the subject instead.`,
      400,
      'SUBJECT_HAS_DEPENDENTS'
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.subject.delete({
      where: { id },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'SUBJECT_DELETED',
        entityType: 'Subject',
        entityId: id,
        oldValues: {
          code: subject.code,
          name: subject.name,
        },
      },
    });
  });
}
