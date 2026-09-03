import { RoleCode } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthorizationError } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';

/**
 * Swanford Academy — Role & Scope Administration Service
 * Master Specification Reference: Sections 2, 5, 6, 18, 25
 *
 * Security Invariant:
 * - ROLE_MANAGE means role assignment and removal only.
 * - Ordinary administrators CANNOT arbitrarily edit the underlying permission catalog.
 * - High-risk administrative and scope operations are auditable via AuditLog.
 */

export interface AssignTeacherScopeInput {
  teacherId: string;
  academicSessionId: string;
  programmeId: string;
  schoolClassId?: string;
  subjectId?: string;
  isFormTeacher?: boolean;
}

/**
 * Assigns a system-defined role to a user.
 * Audited and protected by ROLE_MANAGE permission.
 */
export async function assignRoleToUser(
  actorUserId: string,
  targetUserId: string,
  roleCode: RoleCode
) {
  // Enforce actor permission
  await requirePermission(actorUserId, PermissionCode.ROLE_MANAGE);

  const role = await prisma.role.findUnique({
    where: { code: roleCode },
  });

  if (!role) {
    throw new AuthorizationError(`Role '${roleCode}' not found.`, 404, 'ROLE_NOT_FOUND');
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!targetUser) {
    throw new AuthorizationError('Target user not found.', 404, 'USER_NOT_FOUND');
  }

  const userRole = await prisma.$transaction(async (tx) => {
    const record = await tx.userRole.upsert({
      where: {
        userId_roleId: {
          userId: targetUserId,
          roleId: role.id,
        },
      },
      update: {},
      create: {
        userId: targetUserId,
        roleId: role.id,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'ROLE_ASSIGNED',
        entityType: 'UserRole',
        entityId: `${targetUserId}:${role.id}`,
        newValues: {
          targetUserId,
          roleCode,
          roleId: role.id,
        },
      },
    });

    return record;
  });

  return userRole;
}

/**
 * Removes a role from a user.
 * Audited and protected by ROLE_MANAGE permission.
 * Invariant: Cannot remove the last SUPER_ADMIN to avoid system lock-out.
 */
export async function removeRoleFromUser(
  actorUserId: string,
  targetUserId: string,
  roleCode: RoleCode
) {
  // Enforce actor permission
  await requirePermission(actorUserId, PermissionCode.ROLE_MANAGE);

  const role = await prisma.role.findUnique({
    where: { code: roleCode },
  });

  if (!role) {
    throw new AuthorizationError(`Role '${roleCode}' not found.`, 404, 'ROLE_NOT_FOUND');
  }

  // Prevent removing the last active Super Admin
  if (roleCode === RoleCode.SUPER_ADMIN) {
    const superAdminCount = await prisma.userRole.count({
      where: { roleId: role.id },
    });

    if (superAdminCount <= 1) {
      throw new AuthorizationError(
        'Action blocked: Cannot remove the last active Super Administrator role.',
        400,
        'LAST_SUPER_ADMIN_PROTECTED'
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.userRole.deleteMany({
      where: {
        userId: targetUserId,
        roleId: role.id,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'ROLE_REMOVED',
        entityType: 'UserRole',
        entityId: `${targetUserId}:${role.id}`,
        oldValues: {
          targetUserId,
          roleCode,
          roleId: role.id,
        },
      },
    });
  });
}

/**
 * Assigns a TeacherScope to a teacher.
 * Scope Hierarchy: Teacher -> Programme -> Class -> Subject -> Session
 * Audited and protected by TEACHER_MANAGE permission.
 */
export async function assignTeacherScope(
  actorUserId: string,
  input: AssignTeacherScopeInput
) {
  // Enforce actor permission
  await requirePermission(actorUserId, PermissionCode.TEACHER_MANAGE);

  // Validate teacher exists
  const teacher = await prisma.teacher.findUnique({
    where: { id: input.teacherId },
  });
  if (!teacher) {
    throw new AuthorizationError('Teacher record not found.', 404, 'TEACHER_NOT_FOUND');
  }

  // Validate session exists
  const session = await prisma.academicSession.findUnique({
    where: { id: input.academicSessionId },
  });
  if (!session) {
    throw new AuthorizationError('Academic session not found.', 404, 'SESSION_NOT_FOUND');
  }

  // Validate programme exists
  const programme = await prisma.programme.findUnique({
    where: { id: input.programmeId },
  });
  if (!programme) {
    throw new AuthorizationError('Programme not found.', 404, 'PROGRAMME_NOT_FOUND');
  }

  // If class is specified, validate it belongs to the target programme
  if (input.schoolClassId) {
    const schoolClass = await prisma.schoolClass.findUnique({
      where: { id: input.schoolClassId },
    });
    if (!schoolClass) {
      throw new AuthorizationError('School class not found.', 404, 'CLASS_NOT_FOUND');
    }
    if (schoolClass.programmeId !== input.programmeId) {
      throw new AuthorizationError(
        'Invalid scope: Class does not belong to the selected programme.',
        400,
        'CLASS_PROGRAMME_MISMATCH'
      );
    }
  }

  // If subject is specified, validate it belongs to the target programme
  if (input.subjectId) {
    const subject = await prisma.subject.findUnique({
      where: { id: input.subjectId },
    });
    if (!subject) {
      throw new AuthorizationError('Subject not found.', 404, 'SUBJECT_NOT_FOUND');
    }
    if (subject.programmeId !== input.programmeId) {
      throw new AuthorizationError(
        'Invalid scope: Subject does not belong to the selected programme.',
        400,
        'SUBJECT_PROGRAMME_MISMATCH'
      );
    }
  }

  // Check if identical scope already exists to prevent duplicate authorization records
  const existingScope = await prisma.teacherScope.findFirst({
    where: {
      teacherId: input.teacherId,
      academicSessionId: input.academicSessionId,
      programmeId: input.programmeId,
      schoolClassId: input.schoolClassId || null,
      subjectId: input.subjectId || null,
    },
    include: {
      programme: true,
      schoolClass: true,
      subject: true,
    },
  });

  if (existingScope) {
    return existingScope;
  }

  const teacherScope = await prisma.$transaction(async (tx) => {
    const scope = await tx.teacherScope.create({
      data: {
        teacherId: input.teacherId,
        academicSessionId: input.academicSessionId,
        programmeId: input.programmeId,
        schoolClassId: input.schoolClassId || null,
        subjectId: input.subjectId || null,
        isFormTeacher: input.isFormTeacher || false,
      },
      include: {
        programme: true,
        schoolClass: true,
        subject: true,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'TEACHER_SCOPE_ASSIGNED',
        entityType: 'TeacherScope',
        entityId: scope.id,
        newValues: {
          teacherId: input.teacherId,
          academicSessionId: input.academicSessionId,
          programmeId: input.programmeId,
          schoolClassId: input.schoolClassId || null,
          subjectId: input.subjectId || null,
          isFormTeacher: input.isFormTeacher || false,
        },
      },
    });

    return scope;
  });

  return teacherScope;
}

/**
 * Revokes a TeacherScope from a teacher.
 * Audited and protected by TEACHER_MANAGE permission.
 */
export async function revokeTeacherScope(
  actorUserId: string,
  scopeId: string
) {
  // Enforce actor permission
  await requirePermission(actorUserId, PermissionCode.TEACHER_MANAGE);

  const scope = await prisma.teacherScope.findUnique({
    where: { id: scopeId },
  });

  if (!scope) {
    throw new AuthorizationError('Teacher scope record not found.', 404, 'SCOPE_NOT_FOUND');
  }

  await prisma.$transaction(async (tx) => {
    await tx.teacherScope.delete({
      where: { id: scopeId },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'TEACHER_SCOPE_REVOKED',
        entityType: 'TeacherScope',
        entityId: scopeId,
        oldValues: {
          teacherId: scope.teacherId,
          academicSessionId: scope.academicSessionId,
          programmeId: scope.programmeId,
          schoolClassId: scope.schoolClassId,
          subjectId: scope.subjectId,
        },
      },
    });
  });
}
