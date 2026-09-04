import { EnrollmentType, EnrollmentStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthorizationError, getUserRoles } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { SafeUser } from '@/lib/auth/service';
import { assertParentOwnsStudent } from '@/lib/auth/scopes';

/**
 * Swanford Academy — Multi-Programme Enrollment Service
 * Master Specification Reference: Sections 5, 7, 8, 10
 *
 * Core Invariants:
 * - A student can belong to multiple programmes simultaneously (e.g. Primary 4 + Tahfeez Group A).
 * - Exactly ONE 'MAIN_ACADEMIC' enrollment per student per academic session and term.
 * - Any number of simultaneous 'ADDITIONAL_PROGRAMME' enrollments.
 * - Historical preservation: advancing sessions/classes creates new records; old records remain intact.
 * - Changing a programme enrollment status NEVER automatically changes the student's overall lifecycle status.
 */

export const EnrollStudentProgrammeSchema = z.object({
  studentId: z.string().uuid(),
  programmeId: z.string().uuid(),
  schoolClassId: z.string().uuid(),
  academicSessionId: z.string().uuid(),
  academicTermId: z.string().uuid(),
  enrollmentType: z.nativeEnum(EnrollmentType).optional(),
});

export type EnrollStudentProgrammeInput = z.input<typeof EnrollStudentProgrammeSchema>;

/**
 * Enrolls a student in a programme. Supports simultaneous multi-programme enrollments.
 */
export async function enrollStudentInProgramme(
  actor: SafeUser,
  input: EnrollStudentProgrammeInput
) {
  await requirePermission(actor, PermissionCode.ENROLLMENT_MANAGE);
  const validated = EnrollStudentProgrammeSchema.parse(input);

  // 1. Verify student exists and is active
  const student = await prisma.student.findUnique({
    where: { id: validated.studentId },
  });
  if (!student) {
    throw new AuthorizationError('Student not found.', 404, 'STUDENT_NOT_FOUND');
  }

  // 2. Verify programme exists and retrieve main/additional classification
  const programme = await prisma.programme.findUnique({
    where: { id: validated.programmeId },
  });
  if (!programme || !programme.isActive) {
    throw new AuthorizationError('Programme is inactive or not found.', 400, 'INVALID_PROGRAMME');
  }

  // 3. Verify class belongs to programme
  const schoolClass = await prisma.schoolClass.findUnique({
    where: { id: validated.schoolClassId },
  });
  if (!schoolClass || schoolClass.programmeId !== programme.id || !schoolClass.isActive) {
    throw new AuthorizationError(
      `Class ${validated.schoolClassId} does not belong to programme ${programme.name} or is inactive.`,
      400,
      'INVALID_CLASS_FOR_PROGRAMME'
    );
  }

  // 4. Verify session and term exist and are linked
  const term = await prisma.academicTerm.findUnique({
    where: { id: validated.academicTermId },
  });
  if (!term || term.academicSessionId !== validated.academicSessionId) {
    throw new AuthorizationError(
      'Academic term does not belong to the specified session.',
      400,
      'INVALID_TERM_SESSION_ALIGNMENT'
    );
  }

  // Determine enrollment type (auto-inferred from programme if not explicitly specified)
  const enrollmentType =
    validated.enrollmentType ||
    (programme.isMainAcademic ? EnrollmentType.MAIN_ACADEMIC : EnrollmentType.ADDITIONAL_PROGRAMME);

  const result = await prisma.$transaction(async (tx) => {
    // 5. If MAIN_ACADEMIC, verify student does not already have a MAIN_ACADEMIC enrollment for this term
    if (enrollmentType === EnrollmentType.MAIN_ACADEMIC) {
      const existingMain = await tx.studentProgrammeEnrollment.findFirst({
        where: {
          studentId: validated.studentId,
          academicSessionId: validated.academicSessionId,
          academicTermId: validated.academicTermId,
          enrollmentType: EnrollmentType.MAIN_ACADEMIC,
          enrollmentStatus: EnrollmentStatus.ACTIVE,
        },
        include: { programme: true },
      });

      if (existingMain) {
        throw new AuthorizationError(
          `Student is already actively enrolled in main academic programme '${existingMain.programme.name}' for this term. ` +
            `A student may only have one active main academic programme at a time.`,
          400,
          'MAIN_ACADEMIC_ENROLLMENT_EXISTS'
        );
      }
    }

    // 6. Check for exact duplicate programme enrollment in the same term
    const duplicate = await tx.studentProgrammeEnrollment.findUnique({
      where: {
        unique_student_programme_term_enrollment: {
          studentId: validated.studentId,
          programmeId: validated.programmeId,
          academicSessionId: validated.academicSessionId,
          academicTermId: validated.academicTermId,
        },
      },
    });

    if (duplicate) {
      if (duplicate.enrollmentStatus === EnrollmentStatus.ACTIVE) {
        throw new AuthorizationError(
          `Student is already actively enrolled in programme '${programme.name}' for this term.`,
          400,
          'DUPLICATE_PROGRAMME_ENROLLMENT'
        );
      } else {
        // Reactivate previously withdrawn or completed enrollment for this term
        const reactivated = await tx.studentProgrammeEnrollment.update({
          where: { id: duplicate.id },
          data: {
            schoolClassId: schoolClass.id,
            enrollmentStatus: EnrollmentStatus.ACTIVE,
          },
          include: {
            programme: true,
            schoolClass: true,
          },
        });

        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: 'ENROLLMENT_REACTIVATE',
            entityType: 'student_programme_enrollment',
            entityId: reactivated.id,
            newValues: {
              programme: programme.name,
              class: schoolClass.name,
              enrollmentStatus: reactivated.enrollmentStatus,
            },
          },
        });

        return reactivated;
      }
    }

    // 7. Create new active enrollment
    const created = await tx.studentProgrammeEnrollment.create({
      data: {
        studentId: validated.studentId,
        programmeId: validated.programmeId,
        schoolClassId: validated.schoolClassId,
        academicSessionId: validated.academicSessionId,
        academicTermId: validated.academicTermId,
        enrollmentType,
        enrollmentStatus: EnrollmentStatus.ACTIVE,
      },
      include: {
        programme: true,
        schoolClass: true,
        academicSession: true,
        academicTerm: true,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'ENROLLMENT_CREATE',
        entityType: 'student_programme_enrollment',
        entityId: created.id,
        newValues: {
          studentId: created.studentId,
          programme: programme.name,
          class: schoolClass.name,
          enrollmentType: created.enrollmentType,
          enrollmentStatus: created.enrollmentStatus,
        },
      },
    });

    return created;
  });

  return result;
}

/**
 * Withdraws a student from a specific programme enrollment without affecting their overall student status
 * or their other simultaneous programme enrollments.
 */
export async function withdrawStudentFromProgramme(
  actor: SafeUser,
  enrollmentId: string,
  reason?: string
) {
  await requirePermission(actor, PermissionCode.ENROLLMENT_MANAGE);

  const existing = await prisma.studentProgrammeEnrollment.findUnique({
    where: { id: enrollmentId },
    include: { programme: true, student: true },
  });

  if (!existing) {
    throw new AuthorizationError('Enrollment record not found.', 404, 'ENROLLMENT_NOT_FOUND');
  }

  if (existing.enrollmentStatus === EnrollmentStatus.WITHDRAWN) {
    return existing;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.studentProgrammeEnrollment.update({
      where: { id: enrollmentId },
      data: { enrollmentStatus: EnrollmentStatus.WITHDRAWN },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'ENROLLMENT_WITHDRAW',
        entityType: 'student_programme_enrollment',
        entityId: enrollmentId,
        oldValues: { enrollmentStatus: existing.enrollmentStatus },
        newValues: { enrollmentStatus: EnrollmentStatus.WITHDRAWN, reason: reason || null },
      },
    });

    return res;
  });

  return updated;
}

/**
 * Marks a student's programme enrollment as completed (e.g. at the conclusion of a term or session).
 */
export async function completeStudentProgrammeEnrollment(
  actor: SafeUser,
  enrollmentId: string
) {
  await requirePermission(actor, PermissionCode.ENROLLMENT_MANAGE);

  const existing = await prisma.studentProgrammeEnrollment.findUnique({
    where: { id: enrollmentId },
  });

  if (!existing) {
    throw new AuthorizationError('Enrollment record not found.', 404, 'ENROLLMENT_NOT_FOUND');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.studentProgrammeEnrollment.update({
      where: { id: enrollmentId },
      data: { enrollmentStatus: EnrollmentStatus.COMPLETED },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'ENROLLMENT_COMPLETE',
        entityType: 'student_programme_enrollment',
        entityId: enrollmentId,
        oldValues: { enrollmentStatus: existing.enrollmentStatus },
        newValues: { enrollmentStatus: EnrollmentStatus.COMPLETED },
      },
    });

    return res;
  });

  return updated;
}

/**
 * Advances a student's enrollment to a new session or term, marking the previous enrollment as COMPLETED
 * and creating a new record for the destination session/term, preserving historical lineage.
 */
export async function progressStudentEnrollment(
  actor: SafeUser,
  input: {
    currentEnrollmentId: string;
    nextSessionId: string;
    nextTermId: string;
    nextClassId: string;
  }
) {
  await requirePermission(actor, PermissionCode.ENROLLMENT_MANAGE);

  const current = await prisma.studentProgrammeEnrollment.findUnique({
    where: { id: input.currentEnrollmentId },
    include: { programme: true },
  });

  if (!current) {
    throw new AuthorizationError('Current enrollment not found.', 404, 'ENROLLMENT_NOT_FOUND');
  }

  // Verify next class
  const nextClass = await prisma.schoolClass.findUnique({
    where: { id: input.nextClassId },
  });
  if (!nextClass || nextClass.programmeId !== current.programmeId) {
    throw new AuthorizationError('Next class does not belong to the same programme.', 400, 'INVALID_NEXT_CLASS');
  }

  // Verify next term and session
  const nextTerm = await prisma.academicTerm.findUnique({
    where: { id: input.nextTermId },
  });
  if (!nextTerm || nextTerm.academicSessionId !== input.nextSessionId) {
    throw new AuthorizationError('Next term does not match next session.', 400, 'INVALID_TERM_SESSION');
  }

  const result = await prisma.$transaction(async (tx) => {
    // Mark old enrollment as COMPLETED
    await tx.studentProgrammeEnrollment.update({
      where: { id: input.currentEnrollmentId },
      data: { enrollmentStatus: EnrollmentStatus.COMPLETED },
    });

    // Create new enrollment record
    const nextEnrollment = await tx.studentProgrammeEnrollment.create({
      data: {
        studentId: current.studentId,
        programmeId: current.programmeId,
        schoolClassId: nextClass.id,
        academicSessionId: input.nextSessionId,
        academicTermId: nextTerm.id,
        enrollmentType: current.enrollmentType,
        enrollmentStatus: EnrollmentStatus.ACTIVE,
      },
      include: {
        programme: true,
        schoolClass: true,
        academicSession: true,
        academicTerm: true,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'ENROLLMENT_PROGRESSION',
        entityType: 'student_programme_enrollment',
        entityId: nextEnrollment.id,
        oldValues: {
          enrollmentId: current.id,
          classId: current.schoolClassId,
          status: 'COMPLETED',
        },
        newValues: {
          enrollmentId: nextEnrollment.id,
          classId: nextClass.id,
          status: 'ACTIVE',
        },
      },
    });

    return nextEnrollment;
  });

  return result;
}

/**
 * Retrieves all programme enrollments for a student (historical and current).
 */
export async function getStudentEnrollments(
  actor: SafeUser,
  studentId: string,
  options?: {
    academicSessionId?: string;
    includeHistorical?: boolean;
  }
) {
  const roles = await getUserRoles(actor.id);
  const isParent = roles.includes('PARENT');
  if (isParent) {
    await assertParentOwnsStudent(actor, studentId);
  } else {
    await requirePermission(actor, PermissionCode.STUDENT_VIEW);
  }

  const enrollments = await prisma.studentProgrammeEnrollment.findMany({
    where: {
      studentId,
      ...(options?.academicSessionId && { academicSessionId: options.academicSessionId }),
      ...(!options?.includeHistorical && { enrollmentStatus: EnrollmentStatus.ACTIVE }),
    },
    include: {
      programme: true,
      schoolClass: true,
      academicSession: true,
      academicTerm: true,
    },
    orderBy: [
      { academicSession: { startDate: 'desc' } },
      { academicTerm: { startDate: 'desc' } },
      { createdAt: 'desc' },
    ],
  });

  return enrollments;
}
