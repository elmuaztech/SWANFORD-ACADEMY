import { RelationshipStatus, EnrollmentStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { SafeUser } from '@/lib/auth/service';
import { AuthorizationError, assertAccountActive } from '@/lib/auth/authorization';

/**
 * Swanford Academy — Scope Authorization Engine
 * Master Specification Reference: Sections 2, 5, 6, 18, 25
 *
 * Scope answers:
 * "Which records/programmes/classes/subjects/children may this user access?"
 *
 * Rules:
 * 1. Parent Scope: Subordinate to active GuardianStudentRelationship.
 * 2. Teacher Scope: Hierarchy = Teacher -> Programme -> Class -> Subject -> Session.
 * 3. Multi-Programme Student Scoping: A student enrolled in Primary and Tahfeez
 *    has separate records. A teacher scoped to Primary CANNOT access Tahfeez records.
 */

// -----------------------------------------------------------------------------
// PARENT GUARDIAN SCOPES
// -----------------------------------------------------------------------------

/**
 * Asserts that the authenticated parent/guardian has an active relationship with the requested student.
 * Never trust a studentId supplied by the client.
 */
export async function assertParentOwnsStudent(
  userOrId: SafeUser | string,
  studentId: string
) {
  const userId = typeof userOrId === 'string' ? userOrId : userOrId.id;

  const guardian = await prisma.guardian.findUnique({
    where: { userId },
    include: {
      user: {
        select: {
          status: true,
          lockedUntil: true,
        },
      },
      relationships: {
        where: {
          studentId,
          status: RelationshipStatus.ACTIVE,
        },
        include: {
          student: true,
        },
      },
    },
  });

  if (!guardian) {
    throw new AuthorizationError(
      'Access denied: Authenticated user does not have a linked guardian profile.',
      403,
      'GUARDIAN_PROFILE_MISSING'
    );
  }

  if (guardian.user) {
    assertAccountActive(guardian.user);
  }

  const relationship = guardian.relationships[0];

  if (!relationship) {
    throw new AuthorizationError(
      'Access denied: You are not authorized to view or manage records for this student.',
      403,
      'STUDENT_ACCESS_DENIED'
    );
  }

  return relationship;
}

/**
 * Retrieves the list of all active student IDs accessible to a parent.
 */
export async function getParentAccessibleStudentIds(
  userOrId: SafeUser | string
): Promise<string[]> {
  const userId = typeof userOrId === 'string' ? userOrId : userOrId.id;

  const guardian = await prisma.guardian.findUnique({
    where: { userId },
    include: {
      user: {
        select: {
          status: true,
          lockedUntil: true,
        },
      },
      relationships: {
        where: {
          status: RelationshipStatus.ACTIVE,
        },
        select: {
          studentId: true,
        },
      },
    },
  });

  if (!guardian) {
    return [];
  }

  if (guardian.user) {
    assertAccountActive(guardian.user);
  }

  return guardian.relationships.map((r) => r.studentId);
}

// -----------------------------------------------------------------------------
// TEACHER SCOPES & MULTI-PROGRAMME AUTHORIZATION
// -----------------------------------------------------------------------------

export interface TeacherScopeRequirement {
  programmeId: string;
  schoolClassId?: string;
  subjectId?: string;
  academicSessionId?: string;
}

/**
 * Asserts that a teacher is authorized for a specific Programme, Class, and optional Subject.
 * Scope Hierarchy:
 * Teacher -> Programme -> Class -> Subject -> Academic Session
 *
 * Nullable scope dimensions in the database represent broader authority:
 * - schoolClassId === null: teacher is authorized for the entire programme
 * - subjectId === null: teacher is form-teacher or general class teacher
 */
export async function assertTeacherScope(
  userOrId: SafeUser | string,
  requirement: TeacherScopeRequirement
) {
  const userId = typeof userOrId === 'string' ? userOrId : userOrId.id;

  const teacher = await prisma.teacher.findUnique({
    where: { userId },
    include: {
      user: {
        select: {
          status: true,
          lockedUntil: true,
        },
      },
      scopes: {
        include: {
          programme: true,
          schoolClass: true,
          subject: true,
        },
      },
    },
  });

  if (!teacher) {
    throw new AuthorizationError(
      'Access denied: Authenticated user does not have a linked teacher profile.',
      403,
      'TEACHER_PROFILE_MISSING'
    );
  }

  if (teacher.user) {
    assertAccountActive(teacher.user);
  }

  // Determine active session if not provided
  let targetSessionId = requirement.academicSessionId;
  if (!targetSessionId) {
    const activeSession = await prisma.academicSession.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });
    if (!activeSession) {
      throw new AuthorizationError(
        'System configuration error: No active academic session found.',
        500,
        'NO_ACTIVE_SESSION'
      );
    }
    targetSessionId = activeSession.id;
  }

  // Evaluate teacher scopes against requirement
  const matchingScope = teacher.scopes.find((s) => {
    // 1. Must match academic session
    if (s.academicSessionId !== targetSessionId) return false;

    // 2. Must match programme
    if (s.programmeId !== requirement.programmeId) return false;

    // 3. Class evaluation:
    // If scope has specific schoolClassId, requirement MUST match it.
    // If scope has null schoolClassId, teacher has programme-wide class authority.
    if (s.schoolClassId !== null) {
      if (!requirement.schoolClassId || s.schoolClassId !== requirement.schoolClassId) {
        return false;
      }
    }

    // 4. Subject evaluation:
    // If scope has specific subjectId, requirement MUST match it.
    // If scope has null subjectId, teacher has all-subject authority in that class (e.g. form teacher).
    if (s.subjectId !== null) {
      if (!requirement.subjectId || s.subjectId !== requirement.subjectId) {
        return false;
      }
    }

    return true;
  });

  if (!matchingScope) {
    throw new AuthorizationError(
      'Access denied: Target programme, class, or subject is outside teacher assigned scope.',
      403,
      'SCOPE_UNAUTHORIZED'
    );
  }

  return matchingScope;
}

export interface TeacherStudentScopeRequirement {
  studentId: string;
  programmeId: string;
  schoolClassId?: string;
  subjectId?: string;
  academicSessionId?: string;
}

/**
 * MANDATORY MULTI-PROGRAMME STUDENT AUTHORIZATION:
 *
 * A student may simultaneously belong to Primary and Tahfeez.
 * A teacher authorized for Primary must not gain access to the student's Tahfeez
 * records merely because the student is also enrolled in Primary.
 *
 * Authorization evaluates the programme-specific enrollment/record being accessed.
 *
 * Scenario:
 * Ahmed:
 * - Primary / Primary 4
 * - Tahfeez
 *
 * Teacher A:
 * - Primary / Primary 4 / Mathematics
 *
 * Teacher A:
 * - CAN access Ahmed's Primary-4 Mathematics records
 * - CANNOT access Ahmed's Tahfeez records
 * - CANNOT access Primary 5 records
 * - CANNOT access unrelated students
 */
export async function assertTeacherStudentScope(
  userOrId: SafeUser | string,
  requirement: TeacherStudentScopeRequirement
) {
  // Determine active session if not provided
  let targetSessionId = requirement.academicSessionId;
  if (!targetSessionId) {
    const activeSession = await prisma.academicSession.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });
    if (!activeSession) {
      throw new AuthorizationError(
        'System configuration error: No active academic session found.',
        500,
        'NO_ACTIVE_SESSION'
      );
    }
    targetSessionId = activeSession.id;
  }

  // 1. Verify student has an ACTIVE enrollment in the TARGET programme and session
  const enrollment = await prisma.studentProgrammeEnrollment.findFirst({
    where: {
      studentId: requirement.studentId,
      programmeId: requirement.programmeId,
      academicSessionId: targetSessionId,
      enrollmentStatus: EnrollmentStatus.ACTIVE,
    },
    include: {
      programme: true,
      schoolClass: true,
    },
  });

  if (!enrollment) {
    throw new AuthorizationError(
      'Access denied: Student has no active enrollment in the requested programme for this academic session.',
      403,
      'STUDENT_NOT_ENROLLED_IN_PROGRAMME'
    );
  }

  // If a specific class was requested, confirm student is assigned to that class
  if (
    requirement.schoolClassId &&
    enrollment.schoolClassId !== requirement.schoolClassId
  ) {
    throw new AuthorizationError(
      'Access denied: Student is not enrolled in the requested class.',
      403,
      'STUDENT_CLASS_MISMATCH'
    );
  }

  // 2. Assert teacher is authorized for this student's specific programme and class
  const resolvedClassId = requirement.schoolClassId || enrollment.schoolClassId || undefined;

  const teacherScope = await assertTeacherScope(userOrId, {
    programmeId: requirement.programmeId,
    schoolClassId: resolvedClassId,
    subjectId: requirement.subjectId,
    academicSessionId: targetSessionId,
  });

  return {
    enrollment,
    teacherScope,
  };
}

/**
 * Retrieves all assigned TeacherScopes for the given teacher.
 */
export async function getTeacherAccessibleScopes(userOrId: SafeUser | string) {
  const userId = typeof userOrId === 'string' ? userOrId : userOrId.id;

  const teacher = await prisma.teacher.findUnique({
    where: { userId },
    include: {
      user: {
        select: {
          status: true,
          lockedUntil: true,
        },
      },
      scopes: {
        include: {
          programme: true,
          schoolClass: true,
          subject: true,
          academicSession: true,
        },
      },
    },
  });

  if (!teacher) {
    return [];
  }

  if (teacher.user) {
    assertAccountActive(teacher.user);
  }

  return teacher.scopes;
}
