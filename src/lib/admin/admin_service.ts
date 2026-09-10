import {
  RoleCode,
  UserStatus,
  StudentStatus,
  AttendanceStatus,
  ApplicationStatus,
  InvoiceStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { SafeUser } from '@/lib/auth/service';
import { requirePermission, AuthorizationError, getUserRoles } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { normalizeAttendanceDate } from '@/lib/attendance/attendance_service';

export class NotFoundError extends Error {
  statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * Swanford Academy — Central Administrative Domain Service
 * Master Specification Reference: Work Package C (Admin + Super Admin Portals)
 *
 * Rules:
 * 1. ROLE != PERMISSION != SCOPE enforced on every operation.
 * 2. Real database aggregations — zero fake counters or demo data.
 * 3. Strict anti-privilege escalation (cannot assign Super Admin unless already Super Admin; cannot delete last Super Admin).
 * 4. Atomic transactions and comprehensive audit trails.
 */

// ==========================================
// 1. DASHBOARD METRICS
// ==========================================

export async function getAdminDashboardMetrics(actor: SafeUser) {
  await requirePermission(actor, PermissionCode.STUDENT_VIEW);

  const now = new Date();
  const { date: todayDate } = normalizeAttendanceDate(now);

  const [
    activeStudentsCount,
    guardiansCount,
    teachersCount,
    pendingApplicationsCount,
    activeCycle,
    activeSession,
    attendanceAggregates,
    financeAggregates,
    recentApplications,
    recentPayments,
    recentAuditLogs,
  ] = await Promise.all([
    prisma.student.count({ where: { currentStatus: StudentStatus.ACTIVE } }),
    prisma.guardian.count(),
    prisma.teacher.count(),
    prisma.application.count({
      where: {
        status: { in: [ApplicationStatus.SUBMITTED, ApplicationStatus.UNDER_REVIEW] },
      },
    }),
    prisma.admissionCycle.findFirst({
      where: { status: 'OPEN' },
      select: { id: true, name: true, code: true },
    }),
    prisma.academicSession.findFirst({
      where: { isCurrent: true },
      include: {
        terms: { where: { isCurrent: true }, take: 1 },
      },
    }),
    // Today's attendance summary
    prisma.attendanceRecord.groupBy({
      by: ['status'],
      where: { date: todayDate },
      _count: { _all: true },
    }),
    // Active term finance aggregates
    prisma.invoice.aggregate({
      _sum: {
        totalAmountKobo: true,
        amountPaidKobo: true,
      },
      where: {
        status: { notIn: [InvoiceStatus.CANCELLED] },
      },
    }),
    // Recent admissions
    prisma.application.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        applicationNumber: true,
        applicantFirstName: true,
        applicantLastName: true,
        status: true,
        paymentStatus: true,
        profilePhotoId: true,
        createdAt: true,
        programmeSelections: {
          select: {
            programme: { select: { name: true, code: true } },
          },
        },
      },
    }),
    // Recent payments
    prisma.payment.findMany({
      take: 5,
      where: { status: 'CONFIRMED' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        paymentReference: true,
        amountKobo: true,
        paymentMethod: true,
        paidAt: true,
        receipt: {
          select: { receiptNumber: true },
        },
        invoice: {
          select: {
            student: { select: { firstName: true, lastName: true, admissionNumber: true } },
            guardian: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
    // Recent operational audit logs
    prisma.auditLog.findMany({
      take: 6,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        user: { select: { email: true } },
      },
    }),
  ]);

  // Format attendance breakdown
  const attendanceBreakdown = {
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
    total: 0,
  };

  for (const group of attendanceAggregates) {
    const count = group._count._all;
    attendanceBreakdown.total += count;
    if (group.status === AttendanceStatus.PRESENT) attendanceBreakdown.present = count;
    else if (group.status === AttendanceStatus.ABSENT) attendanceBreakdown.absent = count;
    else if (group.status === AttendanceStatus.LATE) attendanceBreakdown.late = count;
    else if (group.status === AttendanceStatus.EXCUSED) attendanceBreakdown.excused = count;
  }

  const totalInvoicedKobo = financeAggregates._sum.totalAmountKobo || BigInt(0);
  const totalCollectedKobo = financeAggregates._sum.amountPaidKobo || BigInt(0);
  const outstandingKobo =
    totalInvoicedKobo > totalCollectedKobo ? totalInvoicedKobo - totalCollectedKobo : BigInt(0);

  return {
    overview: {
      activeStudents: activeStudentsCount,
      guardians: guardiansCount,
      teachers: teachersCount,
      pendingAdmissions: pendingApplicationsCount,
      activeCycle: activeCycle || null,
      activeSession: activeSession
        ? {
            id: activeSession.id,
            name: activeSession.name,
            currentTerm: activeSession.terms[0]?.name || null,
          }
        : null,
    },
    counts: {
      students: activeStudentsCount,
      teachers: teachersCount,
      guardians: guardiansCount,
      pendingApplications: pendingApplicationsCount,
    },
    todayAttendance: attendanceBreakdown,
    finance: {
      totalInvoicedKobo: totalInvoicedKobo.toString(),
      totalCollectedKobo: totalCollectedKobo.toString(),
      outstandingKobo: outstandingKobo.toString(),
    },
    recentApplications,
    recentPayments: recentPayments.map((p) => ({
      ...p,
      amountPaidKobo: p.amountKobo,
      receiptNumber: p.receipt?.receiptNumber || null,
    })),
    recentAuditLogs,
  };
}

export async function getSuperAdminDashboardMetrics(actor: SafeUser) {
  await requirePermission(actor, PermissionCode.SYSTEM_CONFIG_MANAGE);

  const [
    userStatusCounts,
    roleCounts,
    outboxCounts,
    totalAuditLogs,
    recentSecurityLogs,
  ] = await Promise.all([
    prisma.user.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.userRole.groupBy({
      by: ['roleId'],
      _count: { _all: true },
    }),
    prisma.notification.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.auditLog.count(),
    prisma.auditLog.findMany({
      take: 10,
      where: {
        action: {
          in: [
            'USER_ROLE_ASSIGNED',
            'USER_ROLE_REMOVED',
            'ACCOUNT_DEACTIVATED',
            'ACCOUNT_REACTIVATED',
            'ACCOUNT_UNLOCKED',
            'PASSWORD_RESET_COMPLETED',
            'ASSESSMENT_REOPENED',
            'PAYMENT_REVERSED',
            'ATTENDANCE_CORRECTED',
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { email: true } },
      },
    }),
  ]);

  // Map roles to human counts
  const allRoles = await prisma.role.findMany();
  const roleNameMap = new Map(allRoles.map((r) => [r.id, r.code]));

  const usersByStatus: Record<string, number> = {};
  for (const s of userStatusCounts) {
    usersByStatus[s.status] = s._count._all;
  }

  const usersByRole: Record<string, number> = {};
  for (const r of roleCounts) {
    const code = roleNameMap.get(r.roleId) || r.roleId;
    usersByRole[code] = r._count._all;
  }

  const notificationsByStatus: Record<string, number> = {};
  for (const n of outboxCounts) {
    notificationsByStatus[n.status] = n._count._all;
  }

  return {
    usersByStatus,
    usersByRole,
    notificationsByStatus,
    totalAuditLogs,
    recentSecurityLogs,
  };
}

// ==========================================
// 2. USER / ACCOUNT MANAGEMENT (SUPER ADMIN)
// ==========================================

export async function listAdminUsers(
  actor: SafeUser,
  options?: {
    search?: string;
    status?: UserStatus;
    role?: RoleCode;
    limit?: number;
    offset?: number;
  }
) {
  await requirePermission(actor, PermissionCode.USER_MANAGE);

  const limit = Math.min(options?.limit || 20, 100);
  const offset = options?.offset || 0;

  const where: Prisma.UserWhereInput = {};

  if (options?.status) {
    where.status = options.status;
  }

  if (options?.role) {
    where.userRoles = {
      some: {
        role: { code: options.role },
      },
    };
  }

  if (options?.search?.trim()) {
    const term = options.search.trim();
    where.OR = [
      { email: { contains: term, mode: 'insensitive' } },
      { phoneNumber: { contains: term } },
      { guardianProfile: { firstName: { contains: term, mode: 'insensitive' } } },
      { guardianProfile: { lastName: { contains: term, mode: 'insensitive' } } },
      { teacherProfile: { firstName: { contains: term, mode: 'insensitive' } } },
      { teacherProfile: { lastName: { contains: term, mode: 'insensitive' } } },
    ];
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        phoneNumber: true,
        status: true,
        emailVerifiedAt: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        lastLoginAt: true,
        createdAt: true,
        profilePhotoId: true,
        userRoles: {
          select: {
            role: { select: { id: true, code: true, name: true } },
          },
        },
        guardianProfile: {
          select: { id: true, firstName: true, lastName: true },
        },
        teacherProfile: {
          select: { id: true, staffIdNumber: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
  ]);

  return { total, limit, offset, users };
}

export async function getAdminUserDetails(actor: SafeUser, userId: string) {
  await requirePermission(actor, PermissionCode.USER_MANAGE);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      phoneNumber: true,
      status: true,
      emailVerifiedAt: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      lastLoginAt: true,
      createdAt: true,
      profilePhotoId: true,
      userRoles: {
        select: {
          role: { select: { id: true, code: true, name: true, description: true } },
        },
      },
      guardianProfile: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phonePrimary: true,
          relationships: {
            select: {
              student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } },
            },
          },
        },
      },
      teacherProfile: {
        select: {
          id: true,
          staffIdNumber: true,
          firstName: true,
          lastName: true,
          scopes: {
            include: {
              programme: { select: { name: true, code: true } },
              schoolClass: { select: { name: true, code: true } },
            },
          },
        },
      },
      sessions: {
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, createdAt: true, expiresAt: true, userAgent: true },
      },
    },
  });

  if (!user) {
    throw new AuthorizationError('User account not found.', 404, 'USER_NOT_FOUND');
  }

  return user;
}

export async function updateUserAccountStatus(
  actor: SafeUser,
  userId: string,
  action: 'ACTIVATE' | 'DEACTIVATE' | 'UNLOCK'
) {
  await requirePermission(actor, PermissionCode.USER_MANAGE);

  if (action === 'DEACTIVATE' && actor.id === userId) {
    throw new AuthorizationError('Cannot deactivate your own active user account.', 400, 'SELF_DEACTIVATION_REJECTED');
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, status: true },
  });

  if (!targetUser) {
    throw new AuthorizationError('User account not found.', 404, 'USER_NOT_FOUND');
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    let newStatus = targetUser.status;
    let auditAction = '';

    if (action === 'DEACTIVATE') {
      newStatus = UserStatus.DEACTIVATED;
      auditAction = 'ACCOUNT_DEACTIVATED';
      // Revoke all existing sessions
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
    } else if (action === 'ACTIVATE') {
      newStatus = UserStatus.ACTIVE;
      auditAction = 'ACCOUNT_REACTIVATED';
    } else if (action === 'UNLOCK') {
      auditAction = 'ACCOUNT_UNLOCKED';
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        status: newStatus,
        failedLoginAttempts: action === 'UNLOCK' ? 0 : undefined,
        lockedUntil: action === 'UNLOCK' ? null : undefined,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: auditAction,
        entityType: 'User',
        entityId: userId,
        oldValues: { status: targetUser.status },
        newValues: { status: updated.status, action },
      },
    });

    return updated;
  });
}

export async function assignUserRoles(
  actor: SafeUser,
  targetUserId: string,
  roleCodes: RoleCode[]
) {
  const actorRoles = await getUserRoles(actor.id);
  const isActorSuperAdmin = actorRoles.includes(RoleCode.SUPER_ADMIN);

  // Anti-privilege escalation: non-Super Admins can NEVER grant SUPER_ADMIN
  if (roleCodes.includes(RoleCode.SUPER_ADMIN) && !isActorSuperAdmin) {
    throw new AuthorizationError(
      'Access denied: Only existing Super Admins can grant the Super Admin role.',
      403,
      'SUPER_ADMIN_ELEVATION_DENIED'
    );
  }

  await requirePermission(actor, PermissionCode.ROLE_MANAGE);

  const targetRoles = await getUserRoles(targetUserId);

  // Safeguard: Do not remove SUPER_ADMIN if target is the LAST Super Admin in the system
  if (targetRoles.includes(RoleCode.SUPER_ADMIN) && !roleCodes.includes(RoleCode.SUPER_ADMIN)) {
    const superAdminRole = await prisma.role.findUnique({ where: { code: RoleCode.SUPER_ADMIN } });
    if (superAdminRole) {
      const superAdminCount = await prisma.userRole.count({
        where: { roleId: superAdminRole.id },
      });
      if (superAdminCount <= 1) {
        throw new AuthorizationError(
          'Operation rejected: Cannot revoke the Super Admin role from the last active Super Admin.',
          400,
          'CANNOT_REMOVE_LAST_SUPER_ADMIN'
        );
      }
    }
  }

  // Resolve target Role objects
  const rolesToAssign = await prisma.role.findMany({
    where: { code: { in: roleCodes } },
  });

  return prisma.$transaction(async (tx) => {
    // Remove existing roles
    await tx.userRole.deleteMany({ where: { userId: targetUserId } });

    // Insert new roles
    if (rolesToAssign.length > 0) {
      await tx.userRole.createMany({
        data: rolesToAssign.map((role) => ({
          userId: targetUserId,
          roleId: role.id,
        })),
      });
    }

    // Revoke target user's active sessions so new role set takes immediate effect
    await tx.session.updateMany({
      where: { userId: targetUserId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'USER_ROLES_UPDATED',
        entityType: 'User',
        entityId: targetUserId,
        oldValues: { roles: targetRoles },
        newValues: { roles: roleCodes },
      },
    });

    return rolesToAssign;
  });
}

// ==========================================
// 3. TEACHER MANAGEMENT
// ==========================================

export async function listAdminTeachers(
  actor: SafeUser,
  options?: {
    search?: string;
    programmeId?: string;
    limit?: number;
    offset?: number;
  }
) {
  await requirePermission(actor, PermissionCode.TEACHER_MANAGE);

  const limit = Math.min(options?.limit || 50, 100);
  const offset = options?.offset || 0;

  const where: Prisma.TeacherWhereInput = {};

  if (options?.programmeId) {
    where.scopes = {
      some: { programmeId: options.programmeId },
    };
  }

  if (options?.search?.trim()) {
    const term = options.search.trim();
    where.OR = [
      { firstName: { contains: term, mode: 'insensitive' } },
      { lastName: { contains: term, mode: 'insensitive' } },
      { staffIdNumber: { contains: term, mode: 'insensitive' } },
      { user: { email: { contains: term, mode: 'insensitive' } } },
    ];
  }

  const [total, teachers] = await Promise.all([
    prisma.teacher.count({ where }),
    prisma.teacher.findMany({
      where,
      include: {
        user: {
          select: { id: true, email: true, phoneNumber: true, status: true, profilePhotoId: true },
        },
        scopes: {
          include: {
            programme: { select: { id: true, name: true, code: true } },
            schoolClass: { select: { id: true, name: true, code: true } },
            subject: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: limit,
      skip: offset,
    }),
  ]);

  return { total, limit, offset, teachers };
}

export async function getAdminTeacherDetails(actor: SafeUser, teacherId: string) {
  await requirePermission(actor, PermissionCode.TEACHER_MANAGE);

  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: {
      user: {
        select: { id: true, email: true, phoneNumber: true, status: true, profilePhotoId: true },
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
    throw new AuthorizationError('Teacher profile not found.', 404, 'TEACHER_NOT_FOUND');
  }

  return teacher;
}

export async function assignTeacherScope(
  actor: SafeUser,
  input: {
    teacherId: string;
    programmeId: string;
    schoolClassId?: string | null;
    subjectId?: string | null;
    academicSessionId: string;
    isFormTeacher?: boolean;
    isClassTeacher?: boolean;
  }
) {
  await requirePermission(actor, PermissionCode.TEACHER_MANAGE);

  const teacher = await prisma.teacher.findUnique({ where: { id: input.teacherId } });
  if (!teacher) {
    throw new AuthorizationError('Teacher not found.', 404, 'TEACHER_NOT_FOUND');
  }

  const isForm = input.isFormTeacher ?? input.isClassTeacher ?? false;

  const scope = await prisma.$transaction(async (tx) => {
    const created = await tx.teacherScope.create({
      data: {
        teacherId: input.teacherId,
        programmeId: input.programmeId,
        schoolClassId: input.schoolClassId || null,
        subjectId: input.subjectId || null,
        academicSessionId: input.academicSessionId,
        isFormTeacher: isForm,
      },
      include: {
        programme: true,
        schoolClass: true,
        subject: true,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'TEACHER_SCOPE_ASSIGNED',
        entityType: 'TeacherScope',
        entityId: created.id,
        newValues: {
          teacherId: input.teacherId,
          programme: created.programme.name,
          class: created.schoolClass?.name || null,
          subject: created.subject?.name || null,
        },
      },
    });

    return Object.assign(created, {
      isClassTeacher: created.isFormTeacher,
    });
  });

  return scope;
}

export async function removeTeacherScope(actor: SafeUser, scopeId: string) {
  await requirePermission(actor, PermissionCode.TEACHER_MANAGE);

  const existing = await prisma.teacherScope.findUnique({ where: { id: scopeId } });
  if (!existing) {
    throw new AuthorizationError('Teacher scope not found.', 404, 'SCOPE_NOT_FOUND');
  }

  await prisma.$transaction(async (tx) => {
    await tx.teacherScope.delete({ where: { id: scopeId } });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'TEACHER_SCOPE_REMOVED',
        entityType: 'TeacherScope',
        entityId: scopeId,
        oldValues: {
          teacherId: existing.teacherId,
          programmeId: existing.programmeId,
          schoolClassId: existing.schoolClassId,
        },
      },
    });
  });

  return existing;
}

// ==========================================
// 4. ATTENDANCE OVERSIGHT & CORRECTION
// ==========================================

export async function getAdminAttendanceOverview(
  actor: SafeUser,
  options: {
    date: string | Date;
    programmeId?: string;
    schoolClassId?: string;
  }
) {
  await requirePermission(actor, PermissionCode.ATTENDANCE_VIEW);

  const { date: normalizedDate } = normalizeAttendanceDate(options.date);

  const where: Prisma.AttendanceRecordWhereInput = {
    date: normalizedDate,
    ...(options.programmeId && { programmeId: options.programmeId }),
    ...(options.schoolClassId && { schoolClassId: options.schoolClassId }),
  };

  const [records, summaryGroup] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            admissionNumber: true,
            firstName: true,
            lastName: true,
            profilePhotoId: true,
          },
        },
        programme: { select: { id: true, name: true, code: true } },
        schoolClass: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    }),
    prisma.attendanceRecord.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    }),
  ]);

  const summary = {
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
    total: 0,
  };

  for (const g of summaryGroup) {
    const c = g._count._all;
    summary.total += c;
    if (g.status === AttendanceStatus.PRESENT) summary.present = c;
    else if (g.status === AttendanceStatus.ABSENT) summary.absent = c;
    else if (g.status === AttendanceStatus.LATE) summary.late = c;
    else if (g.status === AttendanceStatus.EXCUSED) summary.excused = c;
  }

  return { date: normalizedDate, summary, records };
}

export async function correctStudentAttendance(
  actor: SafeUser,
  input: {
    recordId?: string;
    studentId?: string;
    programmeId?: string;
    schoolClassId?: string;
    date?: string | Date;
    status?: AttendanceStatus;
    newStatus?: AttendanceStatus;
    remarks?: string | null;
    reason: string;
  }
) {
  await requirePermission(actor, PermissionCode.ATTENDANCE_RECORD);

  if (!input.reason || input.reason.trim().length < 5) {
    throw new AuthorizationError(
      'A clear administrative reason (minimum 5 characters) is required to correct attendance records.',
      400,
      'REASON_REQUIRED'
    );
  }

  let existing = null;
  let entityId = '';

  if (input.recordId) {
    existing = await prisma.attendanceRecord.findUnique({
      where: { id: input.recordId },
    });
    if (existing) {
      entityId = existing.id;
    }
  } else if (input.studentId && input.programmeId && input.schoolClassId && input.date) {
    const { date: normalizedDate, dateString } = normalizeAttendanceDate(input.date);
    entityId = `${input.studentId}:${dateString}`;
    existing = await prisma.attendanceRecord.findUnique({
      where: {
        studentId_programmeId_schoolClassId_date: {
          studentId: input.studentId,
          programmeId: input.programmeId,
          schoolClassId: input.schoolClassId,
          date: normalizedDate,
        },
      },
    });
  }

  if (!existing) {
    throw new NotFoundError(
      'Attendance record does not exist for the specified date and class. Attendance must first be recorded before it can be administratively corrected.'
    );
  }

  const targetStatus = input.newStatus || input.status || existing.status;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.attendanceRecord.update({
      where: { id: existing.id },
      data: {
        status: targetStatus,
        remarks: input.remarks !== undefined ? (input.remarks || null) : existing.remarks,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'ATTENDANCE_CORRECTED',
        entityType: 'AttendanceRecord',
        entityId: entityId || existing.id,
        oldValues: { status: existing.status, remarks: existing.remarks },
        newValues: {
          status: updated.status,
          remarks: updated.remarks,
          reason: input.reason.trim(),
        },
      },
    });

    return updated;
  });
}

// ==========================================
// 5. AUDIT LOG EXPLORER
// ==========================================

export async function listAuditLogs(
  actor: SafeUser,
  options?: {
    action?: string;
    entityType?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }
) {
  await requirePermission(actor, PermissionCode.AUDIT_LOG_VIEW);

  const limit = Math.min(options?.limit || 50, 100);
  const offset = options?.offset || 0;

  const where: Prisma.AuditLogWhereInput = {};

  if (options?.action) {
    where.action = { contains: options.action, mode: 'insensitive' };
  }
  if (options?.entityType) {
    where.entityType = { contains: options.entityType, mode: 'insensitive' };
  }
  if (options?.userId) {
    where.userId = options.userId;
  }
  if (options?.startDate || options?.endDate) {
    where.createdAt = {
      ...(options.startDate && { gte: options.startDate }),
      ...(options.endDate && { lte: options.endDate }),
    };
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
  ]);

  return { total, limit, offset, logs };
}
