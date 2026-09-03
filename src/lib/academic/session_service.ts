import { AcademicSessionStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthorizationError } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { validateDateChronology } from '@/lib/config/timezone';

/**
 * Swanford Academy — Academic Session Management Service
 * Master Specification Reference: Sections 3, 5
 *
 * Core Invariants:
 * - State lifecycle: UPCOMING -> ACTIVE -> COMPLETED -> ARCHIVED.
 * - ARCHIVED -> ACTIVE is strictly forbidden.
 * - Maximum ONE ACTIVE session allowed.
 * - Activating a session fails with ACTIVE_SESSION_EXISTS if another session is already ACTIVE.
 * - Dependent sessions cannot be deleted; they must be ARCHIVED.
 */

export const CreateAcademicSessionSchema = z.object({
  name: z.string().regex(/^\d{4}\/\d{4}$/, 'Session name must match format YYYY/YYYY (e.g. 2026/2027)'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  status: z.nativeEnum(AcademicSessionStatus).default(AcademicSessionStatus.UPCOMING),
});

export const UpdateAcademicSessionSchema = z.object({
  name: z.string().regex(/^\d{4}\/\d{4}$/, 'Session name must match format YYYY/YYYY').optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  status: z.nativeEnum(AcademicSessionStatus).optional(),
});

export type CreateAcademicSessionInput = z.input<typeof CreateAcademicSessionSchema>;
export type UpdateAcademicSessionInput = z.input<typeof UpdateAcademicSessionSchema>;

/**
 * Validates permitted state transitions:
 * UPCOMING -> ACTIVE, COMPLETED, ARCHIVED
 * ACTIVE -> COMPLETED, ARCHIVED
 * COMPLETED -> ARCHIVED
 * ARCHIVED -> none (strictly terminal)
 */
export function assertValidSessionTransition(
  currentStatus: AcademicSessionStatus,
  newStatus: AcademicSessionStatus
): void {
  if (currentStatus === newStatus) return;

  if (currentStatus === AcademicSessionStatus.ARCHIVED) {
    throw new AuthorizationError(
      'Invalid lifecycle transition: Archived sessions cannot be reactivated or modified.',
      400,
      'INVALID_SESSION_TRANSITION'
    );
  }

  if (currentStatus === AcademicSessionStatus.COMPLETED && newStatus === AcademicSessionStatus.ACTIVE) {
    throw new AuthorizationError(
      'Invalid lifecycle transition: Completed sessions cannot be reopened as Active.',
      400,
      'INVALID_SESSION_TRANSITION'
    );
  }

  if (currentStatus === AcademicSessionStatus.COMPLETED && newStatus === AcademicSessionStatus.UPCOMING) {
    throw new AuthorizationError(
      'Invalid lifecycle transition: Completed sessions cannot be reverted to Upcoming.',
      400,
      'INVALID_SESSION_TRANSITION'
    );
  }

  if (currentStatus === AcademicSessionStatus.ACTIVE && newStatus === AcademicSessionStatus.UPCOMING) {
    throw new AuthorizationError(
      'Invalid lifecycle transition: Active sessions cannot be reverted to Upcoming.',
      400,
      'INVALID_SESSION_TRANSITION'
    );
  }
}

export async function listAcademicSessions() {
  return prisma.academicSession.findMany({
    orderBy: { startDate: 'desc' },
    include: {
      terms: {
        orderBy: { startDate: 'asc' },
      },
    },
  });
}

export async function getAcademicSession(id: string) {
  const session = await prisma.academicSession.findUnique({
    where: { id },
    include: {
      terms: {
        orderBy: { startDate: 'asc' },
      },
    },
  });

  if (!session) {
    throw new AuthorizationError('Academic session not found.', 404, 'SESSION_NOT_FOUND');
  }

  return session;
}

export async function createAcademicSession(
  actorUserId: string,
  input: CreateAcademicSessionInput
) {
  await requirePermission(actorUserId, PermissionCode.ACADEMIC_SESSION_MANAGE);

  const validated = CreateAcademicSessionSchema.parse(input);

  if (!validateDateChronology(validated.startDate, validated.endDate)) {
    throw new AuthorizationError(
      'Invalid date range: Start date must be strictly before end date.',
      400,
      'INVALID_DATE_RANGE'
    );
  }

  const existing = await prisma.academicSession.findUnique({
    where: { name: validated.name },
  });
  if (existing) {
    throw new AuthorizationError(
      `An academic session with name '${validated.name}' already exists.`,
      400,
      'DUPLICATE_SESSION_NAME'
    );
  }

  return prisma.$transaction(async (tx) => {
    // Acquire advisory lock for session activation concurrency safety
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(710001)');

    if (validated.status === AcademicSessionStatus.ACTIVE) {
      const activeSession = await tx.academicSession.findFirst({
        where: { status: AcademicSessionStatus.ACTIVE },
      });
      if (activeSession) {
        throw new AuthorizationError(
          `Cannot activate session '${validated.name}': Session '${activeSession.name}' is currently ACTIVE. The administrator must explicitly transition the active session to COMPLETED or ARCHIVED first.`,
          400,
          'ACTIVE_SESSION_EXISTS'
        );
      }
    }

    const session = await tx.academicSession.create({
      data: {
        name: validated.name,
        startDate: validated.startDate,
        endDate: validated.endDate,
        status: validated.status,
        isCurrent: validated.status === AcademicSessionStatus.ACTIVE,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'ACADEMIC_SESSION_CREATED',
        entityType: 'AcademicSession',
        entityId: session.id,
        newValues: {
          name: session.name,
          startDate: session.startDate,
          endDate: session.endDate,
          status: session.status,
        },
      },
    });

    return session;
  });
}

export async function updateAcademicSession(
  actorUserId: string,
  id: string,
  input: UpdateAcademicSessionInput
) {
  await requirePermission(actorUserId, PermissionCode.ACADEMIC_SESSION_MANAGE);

  const validated = UpdateAcademicSessionSchema.parse(input);
  const session = await getAcademicSession(id);

  const newStartDate = validated.startDate || session.startDate;
  const newEndDate = validated.endDate || session.endDate;

  if (!validateDateChronology(newStartDate, newEndDate)) {
    throw new AuthorizationError(
      'Invalid date range: Start date must be strictly before end date.',
      400,
      'INVALID_DATE_RANGE'
    );
  }

  if (validated.name && validated.name !== session.name) {
    const existing = await prisma.academicSession.findUnique({
      where: { name: validated.name },
    });
    if (existing) {
      throw new AuthorizationError(
        `An academic session with name '${validated.name}' already exists.`,
        400,
        'DUPLICATE_SESSION_NAME'
      );
    }
  }

  if (validated.status) {
    assertValidSessionTransition(session.status, validated.status);
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(710001)');

    if (validated.status === AcademicSessionStatus.ACTIVE && session.status !== AcademicSessionStatus.ACTIVE) {
      const activeSession = await tx.academicSession.findFirst({
        where: {
          status: AcademicSessionStatus.ACTIVE,
          id: { not: id },
        },
      });
      if (activeSession) {
        throw new AuthorizationError(
          `Cannot activate session '${session.name}': Session '${activeSession.name}' is currently ACTIVE. The administrator must explicitly transition the active session to COMPLETED or ARCHIVED first.`,
          400,
          'ACTIVE_SESSION_EXISTS'
        );
      }
    }

    const updated = await tx.academicSession.update({
      where: { id },
      data: {
        ...(validated.name && { name: validated.name }),
        ...(validated.startDate && { startDate: validated.startDate }),
        ...(validated.endDate && { endDate: validated.endDate }),
        ...(validated.status && {
          status: validated.status,
          isCurrent: validated.status === AcademicSessionStatus.ACTIVE,
        }),
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'ACADEMIC_SESSION_UPDATED',
        entityType: 'AcademicSession',
        entityId: id,
        oldValues: {
          name: session.name,
          startDate: session.startDate,
          endDate: session.endDate,
          status: session.status,
        },
        newValues: {
          name: updated.name,
          startDate: updated.startDate,
          endDate: updated.endDate,
          status: updated.status,
        },
      },
    });

    return updated;
  });
}

export async function archiveAcademicSession(actorUserId: string, id: string) {
  return updateAcademicSession(actorUserId, id, {
    status: AcademicSessionStatus.ARCHIVED,
  });
}

export async function deleteAcademicSession(actorUserId: string, id: string) {
  await requirePermission(actorUserId, PermissionCode.ACADEMIC_SESSION_MANAGE);

  const session = await getAcademicSession(id);

  // Check dependent records across all domains
  const [termCount, enrollmentCount, feeCount, invoiceCount, appCount] = await Promise.all([
    prisma.academicTerm.count({ where: { academicSessionId: id } }),
    prisma.studentProgrammeEnrollment.count({ where: { academicSessionId: id } }),
    prisma.feeStructure.count({ where: { academicSessionId: id } }),
    prisma.invoice.count({ where: { academicSessionId: id } }),
    prisma.application.count({ where: { academicSessionId: id } }),
  ]);

  const totalDependencies = termCount + enrollmentCount + feeCount + invoiceCount + appCount;

  if (totalDependencies > 0) {
    throw new AuthorizationError(
      `Cannot delete academic session '${session.name}': ${totalDependencies} dependent historical record(s) exist (${enrollmentCount} enrollments, ${invoiceCount} invoices, ${feeCount} fee structures, ${termCount} terms). Archive the session instead to preserve historical integrity.`,
      400,
      'SESSION_HAS_DEPENDENTS'
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.academicSession.delete({
      where: { id },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'ACADEMIC_SESSION_DELETED',
        entityType: 'AcademicSession',
        entityId: id,
        oldValues: {
          name: session.name,
          startDate: session.startDate,
          endDate: session.endDate,
          status: session.status,
        },
      },
    });
  });
}
