import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthorizationError } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { getProgramme } from '@/lib/academic/programme_service';

/**
 * Swanford Academy — School Class Management Service
 * Master Specification Reference: Sections 3, 5, 6
 *
 * Invariants:
 * - Classes belong to a Programme.
 * - Class codes must be globally unique.
 * - Capacity must be positive.
 * - Soft-deactivation (isActive = false) preferred over destructive deletion.
 */

export const CreateSchoolClassSchema = z.object({
  programmeId: z.string().uuid(),
  code: z.string().min(2).max(20).regex(/^[A-Z0-9_]+$/, 'Class code must be uppercase alphanumeric/underscores (e.g. PRI_1)'),
  name: z.string().min(2),
  arm: z.string().optional(),
  capacity: z.number().int().positive('Capacity must be greater than zero').default(30),
  displayOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const UpdateSchoolClassSchema = z.object({
  name: z.string().min(2).optional(),
  arm: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export type CreateSchoolClassInput = z.input<typeof CreateSchoolClassSchema>;
export type UpdateSchoolClassInput = z.input<typeof UpdateSchoolClassSchema>;

export async function listSchoolClasses(options?: {
  programmeId?: string;
  includeInactive?: boolean;
}) {
  return prisma.schoolClass.findMany({
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

export async function getSchoolClass(id: string) {
  const schoolClass = await prisma.schoolClass.findUnique({
    where: { id },
    include: {
      programme: true,
      teacherScopes: true,
    },
  });

  if (!schoolClass) {
    throw new AuthorizationError('School class not found.', 404, 'CLASS_NOT_FOUND');
  }

  return schoolClass;
}

export async function createSchoolClass(
  actorUserId: string,
  input: CreateSchoolClassInput
) {
  await requirePermission(actorUserId, PermissionCode.CLASS_MANAGE);

  const validated = CreateSchoolClassSchema.parse(input);

  // Validate parent programme exists and is active
  const programme = await getProgramme(validated.programmeId);
  if (!programme.isActive) {
    throw new AuthorizationError(
      `Cannot add a class to inactive programme '${programme.name}'.`,
      400,
      'INACTIVE_PROGRAMME'
    );
  }

  // Validate code uniqueness
  const existing = await prisma.schoolClass.findUnique({
    where: { code: validated.code },
  });
  if (existing) {
    throw new AuthorizationError(
      `A class with code '${validated.code}' already exists.`,
      400,
      'DUPLICATE_CLASS_CODE'
    );
  }

  return prisma.$transaction(async (tx) => {
    const schoolClass = await tx.schoolClass.create({
      data: validated,
      include: { programme: true },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'CLASS_CREATED',
        entityType: 'SchoolClass',
        entityId: schoolClass.id,
        newValues: {
          code: schoolClass.code,
          name: schoolClass.name,
          programmeId: schoolClass.programmeId,
          capacity: schoolClass.capacity,
        },
      },
    });

    return schoolClass;
  });
}

export async function updateSchoolClass(
  actorUserId: string,
  id: string,
  input: UpdateSchoolClassInput
) {
  await requirePermission(actorUserId, PermissionCode.CLASS_MANAGE);

  const validated = UpdateSchoolClassSchema.parse(input);
  const schoolClass = await getSchoolClass(id);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.schoolClass.update({
      where: { id },
      data: validated,
      include: { programme: true },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'CLASS_UPDATED',
        entityType: 'SchoolClass',
        entityId: id,
        oldValues: {
          name: schoolClass.name,
          capacity: schoolClass.capacity,
          isActive: schoolClass.isActive,
        },
        newValues: {
          name: updated.name,
          capacity: updated.capacity,
          isActive: updated.isActive,
        },
      },
    });

    return updated;
  });
}

export async function deactivateSchoolClass(actorUserId: string, id: string) {
  return updateSchoolClass(actorUserId, id, { isActive: false });
}

export async function deleteSchoolClass(actorUserId: string, id: string) {
  await requirePermission(actorUserId, PermissionCode.CLASS_MANAGE);

  const schoolClass = await getSchoolClass(id);

  const [enrollmentCount, scopeCount, feeCount, appCount, attendanceCount, assessmentCount] = await Promise.all([
    prisma.studentProgrammeEnrollment.count({ where: { schoolClassId: id } }),
    prisma.teacherScope.count({ where: { schoolClassId: id } }),
    prisma.feeStructure.count({ where: { schoolClassId: id } }),
    prisma.applicationProgrammeSelection.count({ where: { targetClassId: id } }),
    prisma.attendanceRecord.count({ where: { schoolClassId: id } }),
    prisma.assessment.count({ where: { schoolClassId: id } }),
  ]);

  const totalDependencies = enrollmentCount + scopeCount + feeCount + appCount + attendanceCount + assessmentCount;
  if (totalDependencies > 0) {
    const reasons: string[] = [];
    if (enrollmentCount > 0) reasons.push(`${enrollmentCount} student enrollment(s)`);
    if (scopeCount > 0) reasons.push(`${scopeCount} teacher assignment(s)`);
    if (feeCount > 0) reasons.push(`${feeCount} fee structure(s)`);
    if (appCount > 0) reasons.push(`${appCount} admission application(s)`);
    if (attendanceCount > 0) reasons.push(`${attendanceCount} attendance record(s)`);
    if (assessmentCount > 0) reasons.push(`${assessmentCount} assessment(s)`);
    throw new AuthorizationError(
      `Cannot delete class '${schoolClass.name}': historical dependencies exist (${reasons.join(', ')}). Deactivate the class instead to preserve school records.`,
      400,
      'CLASS_HAS_DEPENDENTS'
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.schoolClass.delete({
      where: { id },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'CLASS_DELETED',
        entityType: 'SchoolClass',
        entityId: id,
        oldValues: {
          code: schoolClass.code,
          name: schoolClass.name,
        },
      },
    });
  });
}
