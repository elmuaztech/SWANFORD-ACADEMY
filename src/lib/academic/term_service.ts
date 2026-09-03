import { AcademicTermStatus, TermCode } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthorizationError } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import {
  validateDateChronology,
  isDateRangeWithin,
  doDateRangesOverlap,
} from '@/lib/config/timezone';
import { getAcademicSession } from '@/lib/academic/session_service';

/**
 * Swanford Academy — Academic Term Management Service
 * Master Specification Reference: Sections 3, 5, 6
 *
 * Invariants:
 * - Terms must belong to an academic session.
 * - Term dates must fall strictly within the parent session dates.
 * - Terms within the same session must not overlap in dates.
 * - Only one ACTIVE term permitted per session.
 * - Dependent terms cannot be deleted destructively.
 */

export const CreateAcademicTermSchema = z.object({
  academicSessionId: z.string().uuid(),
  termCode: z.nativeEnum(TermCode),
  name: z.string().min(2),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  status: z.nativeEnum(AcademicTermStatus).default(AcademicTermStatus.UPCOMING),
});

export const UpdateAcademicTermSchema = z.object({
  name: z.string().min(2).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  status: z.nativeEnum(AcademicTermStatus).optional(),
});

export type CreateAcademicTermInput = z.input<typeof CreateAcademicTermSchema>;
export type UpdateAcademicTermInput = z.input<typeof UpdateAcademicTermSchema>;

export async function listAcademicTerms(sessionId?: string) {
  return prisma.academicTerm.findMany({
    where: sessionId ? { academicSessionId: sessionId } : undefined,
    orderBy: { startDate: 'asc' },
    include: {
      academicSession: true,
    },
  });
}

export async function getAcademicTerm(id: string) {
  const term = await prisma.academicTerm.findUnique({
    where: { id },
    include: {
      academicSession: true,
    },
  });

  if (!term) {
    throw new AuthorizationError('Academic term not found.', 404, 'TERM_NOT_FOUND');
  }

  return term;
}

export async function createAcademicTerm(
  actorUserId: string,
  input: CreateAcademicTermInput
) {
  await requirePermission(actorUserId, PermissionCode.ACADEMIC_SESSION_MANAGE);

  const validated = CreateAcademicTermSchema.parse(input);
  const session = await getAcademicSession(validated.academicSessionId);

  // 1. Chronology: startDate < endDate
  if (!validateDateChronology(validated.startDate, validated.endDate)) {
    throw new AuthorizationError(
      'Invalid date range: Term start date must be strictly before end date.',
      400,
      'INVALID_DATE_RANGE'
    );
  }

  // 2. Containment: Term must fall within session date boundaries
  if (!isDateRangeWithin(validated.startDate, validated.endDate, session.startDate, session.endDate)) {
    throw new AuthorizationError(
      `Term dates (${validated.startDate.toISOString().slice(0, 10)} to ${validated.endDate.toISOString().slice(0, 10)}) must be completely within the academic session dates (${session.startDate.toISOString().slice(0, 10)} to ${session.endDate.toISOString().slice(0, 10)}).`,
      400,
      'TERM_OUTSIDE_SESSION_RANGE'
    );
  }

  // 3. Unique termCode in session
  const existingTermCode = await prisma.academicTerm.findUnique({
    where: {
      academicSessionId_termCode: {
        academicSessionId: validated.academicSessionId,
        termCode: validated.termCode,
      },
    },
  });
  if (existingTermCode) {
    throw new AuthorizationError(
      `A term with code '${validated.termCode}' already exists for session '${session.name}'.`,
      400,
      'DUPLICATE_TERM_CODE'
    );
  }

  // 4. Non-overlapping dates within the same session
  const otherTerms = await prisma.academicTerm.findMany({
    where: { academicSessionId: validated.academicSessionId },
  });

  for (const other of otherTerms) {
    if (doDateRangesOverlap(validated.startDate, validated.endDate, other.startDate, other.endDate)) {
      throw new AuthorizationError(
        `Term dates overlap with existing term '${other.name}' (${other.startDate.toISOString().slice(0, 10)} to ${other.endDate.toISOString().slice(0, 10)}).`,
        400,
        'OVERLAPPING_TERM_DATES'
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    // Acquire lock for term concurrency safety
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(710002)');

    if (validated.status === AcademicTermStatus.ACTIVE) {
      const activeTerm = await tx.academicTerm.findFirst({
        where: {
          academicSessionId: validated.academicSessionId,
          status: AcademicTermStatus.ACTIVE,
        },
      });
      if (activeTerm) {
        throw new AuthorizationError(
          `Cannot activate term '${validated.name}': Term '${activeTerm.name}' is already ACTIVE in session '${session.name}'.`,
          400,
          'ACTIVE_TERM_EXISTS'
        );
      }
    }

    const term = await tx.academicTerm.create({
      data: {
        academicSessionId: validated.academicSessionId,
        termCode: validated.termCode,
        name: validated.name,
        startDate: validated.startDate,
        endDate: validated.endDate,
        status: validated.status,
        isCurrent: validated.status === AcademicTermStatus.ACTIVE,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'ACADEMIC_TERM_CREATED',
        entityType: 'AcademicTerm',
        entityId: term.id,
        newValues: {
          name: term.name,
          termCode: term.termCode,
          sessionId: term.academicSessionId,
          startDate: term.startDate,
          endDate: term.endDate,
          status: term.status,
        },
      },
    });

    return term;
  });
}

export async function updateAcademicTerm(
  actorUserId: string,
  id: string,
  input: UpdateAcademicTermInput
) {
  await requirePermission(actorUserId, PermissionCode.ACADEMIC_SESSION_MANAGE);

  const validated = UpdateAcademicTermSchema.parse(input);
  const term = await getAcademicTerm(id);
  const session = term.academicSession;

  const newStartDate = validated.startDate || term.startDate;
  const newEndDate = validated.endDate || term.endDate;

  if (!validateDateChronology(newStartDate, newEndDate)) {
    throw new AuthorizationError(
      'Invalid date range: Start date must be strictly before end date.',
      400,
      'INVALID_DATE_RANGE'
    );
  }

  if (!isDateRangeWithin(newStartDate, newEndDate, session.startDate, session.endDate)) {
    throw new AuthorizationError(
      'Term dates must be completely within the academic session dates.',
      400,
      'TERM_OUTSIDE_SESSION_RANGE'
    );
  }

  // Check overlap with other terms in the same session
  const otherTerms = await prisma.academicTerm.findMany({
    where: {
      academicSessionId: term.academicSessionId,
      id: { not: id },
    },
  });

  for (const other of otherTerms) {
    if (doDateRangesOverlap(newStartDate, newEndDate, other.startDate, other.endDate)) {
      throw new AuthorizationError(
        `Updated term dates overlap with existing term '${other.name}'.`,
        400,
        'OVERLAPPING_TERM_DATES'
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(710002)');

    if (validated.status === AcademicTermStatus.ACTIVE && term.status !== AcademicTermStatus.ACTIVE) {
      const activeTerm = await tx.academicTerm.findFirst({
        where: {
          academicSessionId: term.academicSessionId,
          status: AcademicTermStatus.ACTIVE,
          id: { not: id },
        },
      });
      if (activeTerm) {
        throw new AuthorizationError(
          `Cannot activate term '${term.name}': Term '${activeTerm.name}' is already ACTIVE in this session.`,
          400,
          'ACTIVE_TERM_EXISTS'
        );
      }
    }

    const updated = await tx.academicTerm.update({
      where: { id },
      data: {
        ...(validated.name && { name: validated.name }),
        ...(validated.startDate && { startDate: validated.startDate }),
        ...(validated.endDate && { endDate: validated.endDate }),
        ...(validated.status && {
          status: validated.status,
          isCurrent: validated.status === AcademicTermStatus.ACTIVE,
        }),
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'ACADEMIC_TERM_UPDATED',
        entityType: 'AcademicTerm',
        entityId: id,
        oldValues: {
          name: term.name,
          startDate: term.startDate,
          endDate: term.endDate,
          status: term.status,
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

export async function deleteAcademicTerm(actorUserId: string, id: string) {
  await requirePermission(actorUserId, PermissionCode.ACADEMIC_SESSION_MANAGE);

  const term = await getAcademicTerm(id);

  const [enrollmentCount, feeCount, invoiceCount] = await Promise.all([
    prisma.studentProgrammeEnrollment.count({ where: { academicTermId: id } }),
    prisma.feeStructure.count({ where: { academicTermId: id } }),
    prisma.invoice.count({ where: { academicTermId: id } }),
  ]);

  const totalDependencies = enrollmentCount + feeCount + invoiceCount;
  if (totalDependencies > 0) {
    throw new AuthorizationError(
      `Cannot delete academic term '${term.name}': ${totalDependencies} dependent record(s) exist. Archive or complete the term instead.`,
      400,
      'TERM_HAS_DEPENDENTS'
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.academicTerm.delete({
      where: { id },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'ACADEMIC_TERM_DELETED',
        entityType: 'AcademicTerm',
        entityId: id,
        oldValues: {
          name: term.name,
          termCode: term.termCode,
          sessionId: term.academicSessionId,
        },
      },
    });
  });
}
