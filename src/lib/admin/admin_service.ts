import {
  RoleCode,
  UserStatus,
  StudentStatus,
  TeacherStatus,
  AttendanceStatus,
  ApplicationStatus,
  ApplicationPaymentStatus,
  InvoiceStatus,
  VerificationTokenType,
  NotificationCategory,
  NotificationChannel,
  Prisma,
} from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { SafeUser, sanitizeUser } from '@/lib/auth/service';
import { requirePermission, AuthorizationError, getUserRoles } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { createUnactivatedPasswordSentinel, hashPassword } from '@/lib/auth/password';
import { generateSecureToken } from '@/lib/auth/tokens';
import { parseFullName } from '@/lib/utils/name_parser';
import { toAbsoluteEmailUrl } from '@/lib/utils/url';
import { normalizeAttendanceDate } from '@/lib/attendance/attendance_service';
import { enqueueNotification } from '@/lib/notifications/outbox';
import { processPendingNotifications } from '@/lib/notifications/worker';
import {
  renderWelcomeNewUserEmail,
  renderAdminPasswordResetEmail,
  renderEmailChangedNotification,
  renderAccountActivationEmail,
} from '@/lib/notifications/templates/catalog';

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

  const isSuperAdmin = Boolean(actor.roles?.includes(RoleCode.SUPER_ADMIN));
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
    // Active term finance aggregates (Super Admin exclusively): Invoices + Confirmed Application Fees
    isSuperAdmin
      ? Promise.all([
          prisma.invoice.aggregate({
            _sum: {
              totalAmountKobo: true,
              amountPaidKobo: true,
            },
            where: {
              status: { notIn: [InvoiceStatus.CANCELLED] },
            },
          }),
          prisma.application.aggregate({
            _sum: {
              totalAmountKobo: true,
              amountPaidKobo: true,
            },
            where: {
              paymentStatus: ApplicationPaymentStatus.PAYMENT_CONFIRMED,
            },
          }),
        ])
      : Promise.resolve(null),
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
    // Recent payments (Super Admin exclusively): Invoices + Confirmed Application Fee Payments
    isSuperAdmin
      ? Promise.all([
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
              createdAt: true,
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
          prisma.application.findMany({
            take: 5,
            where: { paymentStatus: ApplicationPaymentStatus.PAYMENT_CONFIRMED },
            orderBy: { updatedAt: 'desc' },
            select: {
              id: true,
              applicationNumber: true,
              paymentReference: true,
              amountPaidKobo: true,
              applicantFirstName: true,
              applicantLastName: true,
              guardianFirstName: true,
              guardianLastName: true,
              updatedAt: true,
              createdAt: true,
            },
          }),
        ])
      : Promise.resolve([[], []]),
    // Recent operational audit logs (Super Admin exclusively)
    isSuperAdmin
      ? prisma.auditLog.findMany({
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
        })
      : Promise.resolve([]),
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

  let totalInvoicedKobo = BigInt(0);
  let totalCollectedKobo = BigInt(0);
  let outstandingKobo = BigInt(0);

  if (isSuperAdmin && financeAggregates) {
    const [invoiceAgg, appAgg] = financeAggregates;
    const invInvoiced = invoiceAgg._sum?.totalAmountKobo || BigInt(0);
    const invCollected = invoiceAgg._sum?.amountPaidKobo || BigInt(0);
    const appInvoiced = appAgg._sum?.totalAmountKobo || BigInt(0);
    const appCollected = appAgg._sum?.amountPaidKobo || BigInt(0);

    totalInvoicedKobo = invInvoiced + (appInvoiced > appCollected ? appInvoiced : appCollected);
    totalCollectedKobo = invCollected + appCollected;
    outstandingKobo =
      totalInvoicedKobo > totalCollectedKobo ? totalInvoicedKobo - totalCollectedKobo : BigInt(0);
  }

  return {
    isSuperAdmin,
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
    finance: isSuperAdmin
      ? {
          totalInvoicedKobo: totalInvoicedKobo.toString(),
          totalCollectedKobo: totalCollectedKobo.toString(),
          outstandingKobo: outstandingKobo.toString(),
        }
      : null,
    recentApplications,
    recentPayments: isSuperAdmin
      ? (() => {
          const [invoicePayments, applicationPayments] = recentPayments as [
            Array<{
              id: string;
              paymentReference: string;
              amountKobo: bigint;
              paymentMethod: string;
              paidAt: Date | null;
              createdAt: Date;
              receipt: { receiptNumber: string } | null;
              invoice: {
                student: { firstName: string; lastName: string; admissionNumber: string | null } | null;
                guardian: { firstName: string; lastName: string } | null;
              } | null;
            }>,
            Array<{
              id: string;
              applicationNumber: string;
              paymentReference: string | null;
              amountPaidKobo: bigint;
              applicantFirstName: string;
              applicantLastName: string;
              guardianFirstName: string;
              guardianLastName: string;
              updatedAt: Date;
              createdAt: Date;
            }>,
          ];

          const mappedInvoicePayments = (invoicePayments || []).map((p) => ({
            id: p.id,
            paymentReference: p.paymentReference,
            amountPaidKobo: p.amountKobo,
            receiptNumber: p.receipt?.receiptNumber || null,
            paidAt: p.paidAt || p.createdAt,
            invoice: p.invoice,
            application: null,
          }));

          const mappedAppPayments = (applicationPayments || []).map((app) => ({
            id: app.id,
            paymentReference: app.paymentReference || `APP-PAY-${app.id.slice(0, 8)}`,
            amountPaidKobo: app.amountPaidKobo,
            receiptNumber: `REC-${app.applicationNumber}`,
            paidAt: app.updatedAt || app.createdAt,
            invoice: null,
            application: {
              applicantFirstName: app.applicantFirstName,
              applicantLastName: app.applicantLastName,
              applicationNumber: app.applicationNumber,
              guardianFirstName: app.guardianFirstName,
              guardianLastName: app.guardianLastName,
            },
          }));

          return [...mappedInvoicePayments, ...mappedAppPayments]
            .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
            .slice(0, 5);
        })()
      : [],
    recentAuditLogs: isSuperAdmin ? recentAuditLogs : [],
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
      { firstName: { contains: term, mode: 'insensitive' } },
      { lastName: { contains: term, mode: 'insensitive' } },
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
        firstName: true,
        lastName: true,
        mustChangePassword: true,
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

  const userEmails = users.map((u) => u.email);
  const matchedApplications = await prisma.application.findMany({
    where: {
      guardianEmail: { in: userEmails, mode: 'insensitive' },
    },
    select: { guardianEmail: true },
  });
  const applicantGuardianEmails = new Set(
    matchedApplications.map((a) => a.guardianEmail.toLowerCase())
  );

  const mappedUsers = users.map((u) => {
    const roles = [...(u.userRoles || [])];
    const emailLower = u.email.toLowerCase();
    const hasRole = (code: string) => roles.some((r) => r.role?.code === code);

    if (u.teacherProfile && !hasRole(RoleCode.TEACHER)) {
      roles.push({
        role: { id: `auto-teacher-${u.id}`, code: RoleCode.TEACHER, name: 'Teacher' },
      });
    }

    if (u.guardianProfile && !hasRole(RoleCode.PARENT)) {
      roles.push({
        role: { id: `auto-parent-${u.id}`, code: RoleCode.PARENT, name: 'Parent / Guardian' },
      });
    } else if (applicantGuardianEmails.has(emailLower) && !hasRole(RoleCode.PARENT)) {
      roles.push({
        role: { id: `auto-applicant-parent-${u.id}`, code: RoleCode.PARENT, name: 'Parent / Guardian' },
      });
    }

    return {
      ...u,
      roles,
      teacher: u.teacherProfile ? { firstName: u.teacherProfile.firstName, lastName: u.teacherProfile.lastName, staffId: u.teacherProfile.staffIdNumber } : null,
      guardian: u.guardianProfile ? { firstName: u.guardianProfile.firstName, lastName: u.guardianProfile.lastName } : null,
    };
  });

  return { total, limit, offset, users: mappedUsers };
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
      firstName: true,
      lastName: true,
      mustChangePassword: true,
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
        select: { id: true, createdAt: true, expiresAt: true, userAgent: true, ipAddress: true },
        orderBy: { createdAt: 'desc' },
      },
      auditLogs: {
        take: 25,
        orderBy: { createdAt: 'desc' },
        select: { id: true, action: true, createdAt: true, newValues: true },
      },
    },
  });

  if (!user) {
    throw new AuthorizationError('User account not found.', 404, 'USER_NOT_FOUND');
  }

  const userRoles = [...(user.userRoles || [])];
  const hasRole = (code: string) => userRoles.some((r) => r.role?.code === code);

  if (user.teacherProfile && !hasRole(RoleCode.TEACHER)) {
    userRoles.push({
      role: { id: `auto-teacher-${user.id}`, code: RoleCode.TEACHER, name: 'Teacher', description: 'Assigned via Faculty Profile' },
    });
  }

  if (user.guardianProfile && !hasRole(RoleCode.PARENT)) {
    userRoles.push({
      role: { id: `auto-parent-${user.id}`, code: RoleCode.PARENT, name: 'Parent / Guardian', description: 'Assigned via Guardian Profile' },
    });
  } else {
    const hasApp = await prisma.application.findFirst({
      where: { guardianEmail: { equals: user.email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (hasApp && !hasRole(RoleCode.PARENT)) {
      userRoles.push({
        role: { id: `auto-applicant-parent-${user.id}`, code: RoleCode.PARENT, name: 'Parent / Guardian', description: 'Registered Admission Applicant Guardian' },
      });
    }
  }

  return {
    ...user,
    roles: userRoles,
    sessions: user.sessions || [],
    auditLogs: user.auditLogs || [],
  };
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

/**
 * Creates a new user account administratively.
 * Invariant: Administrators never view or assign plaintext passwords.
 * The account is provisioned with an unmatchable sentinel hash and PENDING_VERIFICATION status.
 * A 24-hour single-use activation token is generated and delivered to the user's email.
 */
export async function createAdminUser(
  actor: SafeUser,
  input: {
    email: string;
    phoneNumber?: string;
    roles?: RoleCode[];
    roleCode?: RoleCode;
    fullName?: string;
    firstName?: string;
    lastName?: string;
    status?: UserStatus;
    schoolClassId?: string;
    programmeId?: string;
  },
  ipAddress?: string
) {
  await requirePermission(actor, PermissionCode.USER_MANAGE);

  // 1. Full Name Normalization and Validation
  let firstName = input.firstName?.trim();
  let lastName = input.lastName?.trim();

  if (input.fullName?.trim()) {
    const parsed = parseFullName(input.fullName);
    firstName = parsed.firstName;
    lastName = parsed.lastName;
  }

  if (!firstName || !lastName) {
    throw new Error('Full Name is required.');
  }

  // 2. Mandatory Email Validation & Normalization
  if (!input.email || typeof input.email !== 'string' || !input.email.trim()) {
    throw new Error('Email address is mandatory.');
  }
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Please enter a valid email address.');
  }

  // 3. System-Wide Email Uniqueness Check
  const existingUser = await prisma.user.findFirst({
    where: {
      email: {
        equals: normalizedEmail,
        mode: 'insensitive',
      },
    },
  });
  if (existingUser) {
    throw new Error('This email address is already registered to another user.');
  }

  // 4. Mandatory Phone Number Validation & Uniqueness
  if (!input.phoneNumber || typeof input.phoneNumber !== 'string' || !input.phoneNumber.trim()) {
    throw new Error('Phone number is mandatory.');
  }
  const normalizedPhone = input.phoneNumber.trim();
  const digitsOnly = normalizedPhone.replace(/[\s\-\(\)\+]/g, '');
  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    throw new Error('Please enter a valid phone number (11 digits).');
  }

  const existingPhone = await prisma.user.findFirst({
    where: { phoneNumber: normalizedPhone },
  });
  if (existingPhone) {
    throw new Error('This phone number is already registered to another user.');
  }

  // 5. Mandatory Role Selection & Anti-Privilege Escalation
  const resolvedRoles: RoleCode[] =
    input.roles && Array.isArray(input.roles) && input.roles.length > 0
      ? input.roles
      : (input as any).roleCode
        ? [(input as any).roleCode]
        : [];

  if (resolvedRoles.length === 0) {
    throw new Error('At least one assigned role is required.');
  }

  // Anti-privilege escalation & controlled bootstrap:
  // Prohibit creating Super Admin accounts through standard provisioning interface
  if (resolvedRoles.includes(RoleCode.SUPER_ADMIN)) {
    throw new AuthorizationError(
      'Access denied: Creation of Super Admin accounts through the standard user creation interface is prohibited. Elevated root-level accounts cannot be created via standard provisioning.',
      403,
      'SUPER_ADMIN_CREATION_PROHIBITED'
    );
  }

  const isActiveStatus = input.status === UserStatus.ACTIVE;
  const accountStatus = input.status || UserStatus.PENDING_VERIFICATION;

  let tempPassword: string | undefined = undefined;
  let initialPasswordHash: string;

  if (isActiveStatus) {
    const crypto = await import('crypto');
    tempPassword = `SA@${crypto.randomBytes(4).toString('hex').toUpperCase()}!26`;
    initialPasswordHash = await hashPassword(tempPassword);
  } else {
    initialPasswordHash = createUnactivatedPasswordSentinel();
  }

  const rolesToAssign = await prisma.role.findMany({
    where: { code: { in: resolvedRoles } },
  });

  let pendingNotificationId: string | null = null;

  const newUser = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: normalizedEmail,
        phoneNumber: normalizedPhone,
        firstName,
        lastName,
        passwordHash: initialPasswordHash,
        status: accountStatus,
        mustChangePassword: isActiveStatus,
        userRoles: {
          create: rolesToAssign.map((r) => ({ roleId: r.id })),
        },
      },
      include: {
        userRoles: { include: { role: true } },
      },
    });

    // Auto-create linked operational profile if appropriate
    if (resolvedRoles.includes(RoleCode.TEACHER)) {
      const teacherCount = await tx.teacher.count();
      const staffIdNumber = `SA-TEA-${String(teacherCount + 1).padStart(4, '0')}`;
      const newTeacher = await tx.teacher.create({
        data: {
          userId: user.id,
          staffIdNumber,
          firstName,
          lastName,
          status: TeacherStatus.ACTIVE,
        },
      });

      if (input.schoolClassId) {
        const schoolClass = await tx.schoolClass.findUnique({
          where: { id: input.schoolClassId },
        });
        const currentSession =
          (await tx.academicSession.findFirst({ where: { isCurrent: true } })) ||
          (await tx.academicSession.findFirst({ orderBy: { startDate: 'desc' } }));

        if (schoolClass && currentSession) {
          await tx.teacherScope.create({
            data: {
              teacherId: newTeacher.id,
              programmeId: input.programmeId || schoolClass.programmeId,
              schoolClassId: schoolClass.id,
              academicSessionId: currentSession.id,
              isFormTeacher: true,
            },
          });
        }
      }
    }

    if (resolvedRoles.includes(RoleCode.PARENT)) {
      const existingGuardian = await tx.guardian.findUnique({
        where: { email: normalizedEmail },
      });

      if (existingGuardian) {
        if (existingGuardian.userId && existingGuardian.userId !== user.id) {
          throw new Error('A parent portal account is already linked to this guardian email address.');
        }
        await tx.guardian.update({
          where: { id: existingGuardian.id },
          data: {
            userId: user.id,
            isVerified: true,
            phonePrimary: existingGuardian.phonePrimary || normalizedPhone,
          },
        });
      } else {
        await tx.guardian.create({
          data: {
            userId: user.id,
            firstName,
            lastName,
            email: normalizedEmail,
            phonePrimary: normalizedPhone,
            isVerified: true,
          },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'USER_CREATED_BY_ADMIN',
        entityType: 'User',
        entityId: user.id,
        ipAddress,
        newValues: {
          email: normalizedEmail,
          phoneNumber: normalizedPhone,
          firstName,
          lastName,
          roles: input.roles,
          status: accountStatus,
          mustChangePassword: isActiveStatus,
        },
      },
    });

    const primaryRole = rolesToAssign[0]?.name || 'User';
    const recipientName = `${firstName} ${lastName}`.trim();

    if (isActiveStatus && tempPassword) {
      const loginUrl = toAbsoluteEmailUrl('/auth/login');
      const rendered = renderWelcomeNewUserEmail({
        recipientName,
        roleName: primaryRole,
        email: normalizedEmail,
        temporaryPassword: tempPassword,
        loginUrl,
      });

      const notifResult = await enqueueNotification(
        {
          idempotencyKey: `SECURITY:USER_WELCOME:${user.id}:${Date.now()}`,
          recipientUserId: user.id,
          recipientEmail: normalizedEmail,
          channel: NotificationChannel.EMAIL,
          category: NotificationCategory.SECURITY,
          templateName: 'WELCOME_NEW_USER',
          subject: rendered.subject,
          bodyText: rendered.text,
          htmlBody: rendered.html,
          metadata: { tempPasswordGenerated: true, roleName: primaryRole },
        },
        tx
      );

      if (notifResult.notificationId) {
        processPendingNotifications({ targetNotificationId: notifResult.notificationId }).catch(() => { });
      }
    } else {
      // PENDING_VERIFICATION: create activation token and send activation link
      const { rawToken, tokenHash } = generateSecureToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await tx.emailVerification.create({
        data: {
          userId: user.id,
          tokenHash,
          email: normalizedEmail,
          tokenType: VerificationTokenType.ACCOUNT_ACTIVATION,
          expiresAt,
        },
      });

      const activationUrl = toAbsoluteEmailUrl(`/auth/activate?token=${rawToken}`);
      const rendered = renderAccountActivationEmail({
        recipientName,
        activationUrl,
        expiresInHours: 72,
        roleName: primaryRole,
      });

      const notifResult = await enqueueNotification(
        {
          idempotencyKey: `SECURITY:ACCOUNT_ACTIVATION:${user.id}:${tokenHash}`,
          recipientUserId: user.id,
          recipientEmail: normalizedEmail,
          channel: NotificationChannel.EMAIL,
          category: NotificationCategory.SECURITY,
          templateName: 'ACCOUNT_ACTIVATION',
          subject: rendered.subject,
          bodyText: rendered.text,
          htmlBody: rendered.html,
          metadata: { tokenHash, expiresAt: expiresAt.toISOString() },
        },
        tx
      );

      if (notifResult.notificationId) {
        pendingNotificationId = notifResult.notificationId;
      }
    }

    return user;
  });

  if (pendingNotificationId) {
    processPendingNotifications({ targetNotificationId: pendingNotificationId }).catch(() => { });
  } else {
    processPendingNotifications().catch(() => { });
  }

  const safe = sanitizeUser(newUser);
  return {
    ...safe,
    user: safe,
    temporaryPassword: tempPassword,
  };
}

/**
 * Administratively initiates a password reset for a user account.
 * Generates a 24-hour single-use token, invalidates prior sessions, and dispatches reset email.
 * Administrators never see, set, or know the user's password.
 */
export async function adminInitiatePasswordReset(
  actor: SafeUser,
  targetUserId: string,
  ipAddress?: string
) {
  await requirePermission(actor, PermissionCode.USER_MANAGE);

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: {
      userRoles: { include: { role: true } },
      guardianProfile: true,
      teacherProfile: true,
    },
  });

  if (!targetUser) {
    throw new AuthorizationError('User account not found.', 404, 'USER_NOT_FOUND');
  }

  if (targetUser.status === UserStatus.DEACTIVATED) {
    throw new Error('Cannot initiate a password reset for a deactivated user account.');
  }

  // Anti-privilege escalation
  const targetRoles = targetUser.userRoles.map((ur) => ur.role.code);
  const actorRoles = await getUserRoles(actor.id);
  if (targetRoles.includes(RoleCode.SUPER_ADMIN) && !actorRoles.includes(RoleCode.SUPER_ADMIN)) {
    throw new AuthorizationError(
      'Access denied: Only existing Super Admins can initiate password resets for a Super Admin.',
      403,
      'SUPER_ADMIN_PROTECTED'
    );
  }

  const { rawToken, tokenHash } = generateSecureToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

  await prisma.$transaction(async (tx) => {
    // 1. Invalidate any prior active reset records
    await tx.passwordReset.updateMany({
      where: { userId: targetUserId, usedAt: null },
      data: { usedAt: now },
    });

    // 2. Persist new 24-hour reset token hash
    await tx.passwordReset.create({
      data: {
        userId: targetUserId,
        tokenHash,
        expiresAt,
      },
    });

    // 3. Revoke all active sessions for target user
    await tx.session.updateMany({
      where: { userId: targetUserId, revokedAt: null },
      data: { revokedAt: now },
    });

    // 4. Audit trail
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'ADMIN_INITIATED_PASSWORD_RESET',
        entityType: 'User',
        entityId: targetUserId,
        ipAddress,
      },
    });

    // 5. Render and enqueue notification
    const resetUrl = toAbsoluteEmailUrl(`/auth/reset-password?token=${rawToken}`);
    const recipientName = targetUser.guardianProfile
      ? `${targetUser.guardianProfile.firstName} ${targetUser.guardianProfile.lastName}`.trim()
      : targetUser.teacherProfile
        ? `${targetUser.teacherProfile.firstName} ${targetUser.teacherProfile.lastName}`.trim()
        : targetUser.email.split('@')[0];

    const rendered = renderAdminPasswordResetEmail({
      recipientName,
      resetUrl,
      expiresInHours: 24,
    });

    const notifResult = await enqueueNotification(
      {
        idempotencyKey: `SECURITY:ADMIN_PW_RESET:${targetUserId}:${tokenHash}`,
        recipientUserId: targetUserId,
        recipientEmail: targetUser.email,
        channel: NotificationChannel.EMAIL,
        category: NotificationCategory.SECURITY,
        templateName: 'ADMIN_PASSWORD_RESET',
        subject: rendered.subject,
        bodyText: rendered.text,
        htmlBody: rendered.html,
        metadata: { tokenHash, resetUrl },
      },
      tx
    );

    if (notifResult.notificationId) {
      processPendingNotifications({ targetNotificationId: notifResult.notificationId }).catch(() => { });
    }
  });

  return {
    success: true,
    message: 'Administrative password reset instructions have been dispatched to the user’s registered email.',
  };
}

/**
 * Administratively changes a user's registered email address for account recovery.
 * Security requirements:
 * 1. Explicit identity verification confirmation by the administrator.
 * 2. Non-empty administrative justification logged to immutable audit trail.
 * 3. Security alert dispatched to the old email address when possible.
 * 4. Verification token dispatched to the new email address to confirm ownership.
 * 5. Immediate revocation of all active sessions.
 */
export async function adminChangeUserEmail(
  actor: SafeUser,
  targetUserId: string,
  input: {
    newEmail: string;
    reason: string;
    identityVerified: boolean;
  },
  ipAddress?: string
) {
  await requirePermission(actor, PermissionCode.USER_MANAGE);

  if (!input.identityVerified) {
    throw new Error('Identity verification required: You must confirm the account holder identity before modifying their registered email.');
  }

  const cleanReason = input.reason?.trim() || '';
  if (cleanReason.length < 5) {
    throw new Error('Please provide an administrative reason (minimum 5 characters) for the email change.');
  }

  const normalizedNewEmail = input.newEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedNewEmail)) {
    throw new Error('Please enter a valid new email address.');
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: {
      userRoles: { include: { role: true } },
      guardianProfile: true,
      teacherProfile: true,
    },
  });

  if (!targetUser) {
    throw new AuthorizationError('User account not found.', 404, 'USER_NOT_FOUND');
  }

  if (targetUser.status === UserStatus.DEACTIVATED) {
    throw new Error('Cannot change email for a deactivated account.');
  }

  if (normalizedNewEmail === targetUser.email.toLowerCase()) {
    throw new Error('New email address must be different from current email address.');
  }

  // Anti-privilege escalation
  const targetRoles = targetUser.userRoles.map((ur) => ur.role.code);
  const actorRoles = await getUserRoles(actor.id);
  if (targetRoles.includes(RoleCode.SUPER_ADMIN) && !actorRoles.includes(RoleCode.SUPER_ADMIN)) {
    throw new AuthorizationError(
      'Access denied: Only existing Super Admins can alter email credentials for a Super Admin.',
      403,
      'SUPER_ADMIN_PROTECTED'
    );
  }

  const emailInUse = await prisma.user.findUnique({
    where: { email: normalizedNewEmail },
  });
  if (emailInUse) {
    throw new Error('The specified new email address is already registered to another user.');
  }

  const oldEmail = targetUser.email;
  const { rawToken, tokenHash } = generateSecureToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

  await prisma.$transaction(async (tx) => {
    // 1. Update user email and mark unverified until new email confirmation
    await tx.user.update({
      where: { id: targetUserId },
      data: {
        email: normalizedNewEmail,
        emailVerifiedAt: null,
      },
    });

    // 2. Invalidate prior active email verifications
    await tx.emailVerification.updateMany({
      where: { userId: targetUserId, usedAt: null },
      data: { usedAt: now },
    });

    // 3. Create verification token for the new email address
    await tx.emailVerification.create({
      data: {
        userId: targetUserId,
        tokenHash,
        email: normalizedNewEmail,
        tokenType: VerificationTokenType.EMAIL_VERIFICATION,
        expiresAt,
      },
    });

    // 4. Revoke active sessions
    await tx.session.updateMany({
      where: { userId: targetUserId, revokedAt: null },
      data: { revokedAt: now },
    });

    // 5. Immutable Audit Log
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'ADMIN_CHANGED_USER_EMAIL',
        entityType: 'User',
        entityId: targetUserId,
        ipAddress,
        oldValues: { email: oldEmail },
        newValues: {
          email: normalizedNewEmail,
          reason: cleanReason,
          identityVerified: true,
        },
      },
    });

    const recipientName = targetUser.guardianProfile
      ? `${targetUser.guardianProfile.firstName} ${targetUser.guardianProfile.lastName}`.trim()
      : targetUser.teacherProfile
        ? `${targetUser.teacherProfile.firstName} ${targetUser.teacherProfile.lastName}`.trim()
        : targetUser.email.split('@')[0];

    // 6. Security notification to OLD email (when possible)
    const oldAlert = renderEmailChangedNotification({
      recipientName,
      oldEmail,
      newEmail: normalizedNewEmail,
      isNewEmailNotice: false,
    });
    const oldNotif = await enqueueNotification(
      {
        idempotencyKey: `SECURITY:EMAIL_CHANGE_OLD:${targetUserId}:${Date.now()}`,
        recipientUserId: targetUserId,
        recipientEmail: oldEmail,
        channel: NotificationChannel.EMAIL,
        category: NotificationCategory.SECURITY,
        templateName: 'EMAIL_CHANGED_ALERT',
        subject: oldAlert.subject,
        bodyText: oldAlert.text,
        htmlBody: oldAlert.html,
        metadata: { oldEmail, newEmail: normalizedNewEmail },
      },
      tx
    );

    // 7. Verification email to NEW email
    const verificationUrl = toAbsoluteEmailUrl(`/api/auth/verify-email?token=${rawToken}`);
    const newNotice = renderEmailChangedNotification({
      recipientName,
      oldEmail,
      newEmail: normalizedNewEmail,
      isNewEmailNotice: true,
      verificationUrl,
    });
    const newNotif = await enqueueNotification(
      {
        idempotencyKey: `SECURITY:EMAIL_VERIFY_NEW:${targetUserId}:${tokenHash}`,
        recipientUserId: targetUserId,
        recipientEmail: normalizedNewEmail,
        channel: NotificationChannel.EMAIL,
        category: NotificationCategory.SECURITY,
        templateName: 'EMAIL_VERIFICATION',
        subject: newNotice.subject,
        bodyText: newNotice.text,
        htmlBody: newNotice.html,
        metadata: { tokenHash, verificationUrl },
      },
      tx
    );

    if (oldNotif.notificationId) {
      processPendingNotifications({ targetNotificationId: oldNotif.notificationId }).catch(() => { });
    }
    if (newNotif.notificationId) {
      processPendingNotifications({ targetNotificationId: newNotif.notificationId }).catch(() => { });
    }
  });

  return {
    success: true,
    oldEmail,
    newEmail: normalizedNewEmail,
    message: 'User email updated. Security alert dispatched to previous address and verification link sent to new address.',
  };
}

export const UpdateAdminUserProfileSchema = z.object({
  fullName: z.string().trim().optional(),
  firstName: z.string().min(1, 'First name is required').trim().optional(),
  lastName: z.string().min(1, 'Last name is required').trim().optional(),
  email: z.string().email('Invalid email address').trim().optional(),
  phoneNumber: z.string().trim().nullable().optional(),
  status: z.nativeEnum(UserStatus).optional(),
  roles: z.array(z.nativeEnum(RoleCode)).optional(),
});

export type UpdateAdminUserProfileInput = z.infer<typeof UpdateAdminUserProfileSchema>;

/**
 * Super Admin exclusive: Modifies user account identity, details, status, and role assignments.
 */
export async function updateAdminUserProfile(
  actor: SafeUser,
  userId: string,
  input: UpdateAdminUserProfileInput
) {
  const actorRoles = await getUserRoles(actor.id);
  const isSuperAdmin = actorRoles.includes(RoleCode.SUPER_ADMIN);
  if (!isSuperAdmin) {
    throw new AuthorizationError(
      'Access denied: Only Super Administrators have authority to modify user accounts.',
      403,
      'SUPER_ADMIN_REQUIRED'
    );
  }

  const validated = UpdateAdminUserProfileSchema.parse(input);

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: { include: { role: true } },
      teacherProfile: true,
      guardianProfile: true,
    },
  });

  if (!existing) {
    throw new AuthorizationError('User account not found.', 404, 'USER_NOT_FOUND');
  }

  // Check email uniqueness if changed
  if (validated.email && validated.email.toLowerCase() !== existing.email.toLowerCase()) {
    const emailConflict = await prisma.user.findUnique({
      where: { email: validated.email.toLowerCase() },
    });
    if (emailConflict && emailConflict.id !== userId) {
      throw new AuthorizationError('An account with this email address already exists.', 400, 'EMAIL_IN_USE');
    }
  }

  // Check phone uniqueness if changed
  if (validated.phoneNumber && validated.phoneNumber !== existing.phoneNumber) {
    const phoneConflict = await prisma.user.findUnique({
      where: { phoneNumber: validated.phoneNumber },
    });
    if (phoneConflict && phoneConflict.id !== userId) {
      throw new AuthorizationError('An account with this phone number already exists.', 400, 'PHONE_IN_USE');
    }
  }

  return prisma.$transaction(async (tx) => {
    // If roles changed, update role assignments
    if (validated.roles) {
      const currentRoleCodes = existing.userRoles.map((ur) => ur.role.code);
      const isDemotingSuperAdmin =
        currentRoleCodes.includes(RoleCode.SUPER_ADMIN) &&
        !validated.roles.includes(RoleCode.SUPER_ADMIN);

      if (isDemotingSuperAdmin) {
        const superAdminRole = await tx.role.findUnique({ where: { code: RoleCode.SUPER_ADMIN } });
        if (superAdminRole) {
          const activeSuperAdminCount = await tx.userRole.count({
            where: {
              roleId: superAdminRole.id,
              user: { status: UserStatus.ACTIVE },
            },
          });
          if (activeSuperAdminCount <= 1) {
            throw new AuthorizationError(
              'Security invariant violation: Cannot revoke Super Administrator from the school’s sole active Super Administrator.',
              400,
              'SOLE_SUPER_ADMIN_PROTECTED'
            );
          }
        }
      }

      // Sync roles
      await tx.userRole.deleteMany({ where: { userId } });
      const targetRoles = await tx.role.findMany({
        where: { code: { in: validated.roles } },
      });
      for (const role of targetRoles) {
        await tx.userRole.create({
          data: { userId, roleId: role.id },
        });
      }
    }

    // Update User record
    let fName = validated.firstName;
    let lName = validated.lastName;
    if (validated.fullName?.trim()) {
      const parsed = parseFullName(validated.fullName);
      fName = parsed.firstName;
      lName = parsed.lastName;
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        ...(fName !== undefined && { firstName: fName }),
        ...(lName !== undefined && { lastName: lName }),
        ...(validated.email && { email: validated.email.toLowerCase() }),
        ...(validated.phoneNumber !== undefined && { phoneNumber: validated.phoneNumber || null }),
        ...(validated.status && { status: validated.status }),
      },
      include: {
        userRoles: { include: { role: true } },
      },
    });

    // Synchronize linked Teacher Profile
    if (existing.teacherProfile) {
      await tx.teacher.update({
        where: { id: existing.teacherProfile.id },
        data: {
          ...(fName && { firstName: fName }),
          ...(lName && { lastName: lName }),
        },
      });
    }

    // Synchronize linked Guardian Profile
    if (existing.guardianProfile) {
      await tx.guardian.update({
        where: { id: existing.guardianProfile.id },
        data: {
          ...(fName && { firstName: fName }),
          ...(lName && { lastName: lName }),
          ...(validated.email && { email: validated.email.toLowerCase() }),
          ...(validated.phoneNumber !== undefined && { phonePrimary: validated.phoneNumber || null }),
        },
      });
    }

    // Audit log
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'USER_UPDATED',
        entityType: 'User',
        entityId: userId,
        oldValues: {
          email: existing.email,
          status: existing.status,
          firstName: existing.firstName,
          lastName: existing.lastName,
        },
        newValues: {
          email: updated.email,
          status: updated.status,
          firstName: updated.firstName,
          lastName: updated.lastName,
        },
      },
    });

    return updated;
  });
}

/**
 * Super Admin exclusive: Permanently deletes a user account with all dependent references handled safely.
 */
export async function deleteAdminUser(actor: SafeUser, userId: string) {
  const actorRoles = await getUserRoles(actor.id);
  const isSuperAdmin = actorRoles.includes(RoleCode.SUPER_ADMIN);
  if (!isSuperAdmin) {
    throw new AuthorizationError(
      'Access denied: Only Super Administrators have authority to permanently delete user accounts.',
      403,
      'SUPER_ADMIN_REQUIRED'
    );
  }

  if (actor.id === userId) {
    throw new AuthorizationError(
      'Security violation: Cannot delete your own active administrator account.',
      400,
      'SELF_DELETION_REJECTED'
    );
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      teacherProfile: { select: { id: true } },
      guardianProfile: { select: { id: true } },
    },
  });

  if (!targetUser) {
    throw new AuthorizationError('User account not found.', 404, 'USER_NOT_FOUND');
  }

  // Prevent deleting the last active Super Admin
  const targetRoles = await getUserRoles(userId);
  if (targetRoles.includes(RoleCode.SUPER_ADMIN)) {
    const superAdminRole = await prisma.role.findUnique({ where: { code: RoleCode.SUPER_ADMIN } });
    if (superAdminRole) {
      const activeSuperAdminCount = await prisma.userRole.count({
        where: {
          roleId: superAdminRole.id,
          user: { status: UserStatus.ACTIVE },
        },
      });
      if (activeSuperAdminCount <= 1) {
        throw new AuthorizationError(
          'Security invariant violation: Cannot delete the school’s sole active Super Administrator.',
          400,
          'SOLE_SUPER_ADMIN_PROTECTED'
        );
      }
    }
  }

  return prisma.$transaction(async (tx) => {
    // 1. Delete user sessions, tokens, notifications
    await tx.session.deleteMany({ where: { userId } });
    await tx.passwordReset.deleteMany({ where: { userId } });
    await tx.emailVerification.deleteMany({ where: { userId } });
    await tx.notificationPreference.deleteMany({ where: { userId } });
    await tx.userNotificationRead.deleteMany({ where: { userId } });
    await tx.userRole.deleteMany({ where: { userId } });

    // 2. Clean up messages & reviews
    await tx.internalMessage.deleteMany({ where: { senderUserId: userId } });
    await tx.applicationReview.deleteMany({ where: { reviewerId: userId } });

    // 3. Handle teacher profile if linked
    if (targetUser.teacherProfile) {
      const teacherId = targetUser.teacherProfile.id;
      await tx.attendanceRecord.deleteMany({ where: { recordedByTeacherId: teacherId } });
      await tx.teacherScope.deleteMany({ where: { teacherId } });
      await tx.staffDocument.deleteMany({ where: { teacherId } });
      await tx.staffProbationRecord.deleteMany({ where: { teacherId } });
      await tx.teacherAssignmentHistory.deleteMany({ where: { teacherId } });
      await tx.teacher.delete({ where: { id: teacherId } });
    }

    // 4. Handle guardian profile if linked
    if (targetUser.guardianProfile) {
      await tx.guardian.update({
        where: { id: targetUser.guardianProfile.id },
        data: { userId: null },
      });
    }

    // 5. Delete the User record
    const deleted = await tx.user.delete({ where: { id: userId } });

    // 6. Audit log
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'USER_DELETED',
        entityType: 'User',
        entityId: userId,
        oldValues: { email: targetUser.email },
      },
    });

    return deleted;
  });
}

/**
 * Performs emergency account recovery actions (e.g. unlock locked account, resend activation).
 */
export async function adminEmergencyAccountRecovery(
  actor: SafeUser,
  targetUserId: string,
  input: {
    reason: string;
    unlockAccount?: boolean;
    sendNewActivationLink?: boolean;
  },
  ipAddress?: string
) {
  await requirePermission(actor, PermissionCode.USER_MANAGE);

  const cleanReason = input.reason?.trim() || '';
  if (cleanReason.length < 5) {
    throw new Error('Please specify an administrative justification for this recovery action.');
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: {
      userRoles: { include: { role: true } },
      guardianProfile: true,
      teacherProfile: true,
    },
  });

  if (!targetUser) {
    throw new AuthorizationError('User account not found.', 404, 'USER_NOT_FOUND');
  }

  // Anti-privilege escalation
  const targetRoles = targetUser.userRoles.map((ur) => ur.role.code);
  const actorRoles = await getUserRoles(actor.id);
  if (targetRoles.includes(RoleCode.SUPER_ADMIN) && !actorRoles.includes(RoleCode.SUPER_ADMIN)) {
    throw new AuthorizationError(
      'Access denied: Only existing Super Admins can execute recovery on a Super Admin account.',
      403,
      'SUPER_ADMIN_PROTECTED'
    );
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    if (input.unlockAccount) {
      await tx.user.update({
        where: { id: targetUserId },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    }

    if (input.sendNewActivationLink) {
      const { rawToken, tokenHash } = generateSecureToken();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      await tx.emailVerification.updateMany({
        where: { userId: targetUserId, usedAt: null },
        data: { usedAt: now },
      });

      await tx.emailVerification.create({
        data: {
          userId: targetUserId,
          tokenHash,
          email: targetUser.email,
          tokenType: VerificationTokenType.ACCOUNT_ACTIVATION,
          expiresAt,
        },
      });

      const activationUrl = toAbsoluteEmailUrl(`/auth/activate?token=${rawToken}`);
      const primaryRole = targetRoles[0] || 'Member';
      const recipientName = targetUser.guardianProfile
        ? `${targetUser.guardianProfile.firstName} ${targetUser.guardianProfile.lastName}`.trim()
        : targetUser.teacherProfile
          ? `${targetUser.teacherProfile.firstName} ${targetUser.teacherProfile.lastName}`.trim()
          : targetUser.email.split('@')[0];

      const rendered = renderWelcomeNewUserEmail({
        recipientName,
        roleName: primaryRole,
        email: targetUser.email,
        activationUrl,
        expiresInHours: 24,
      });

      const notif = await enqueueNotification(
        {
          idempotencyKey: `SECURITY:EMERGENCY_ACTIVATION:${targetUserId}:${tokenHash}`,
          recipientUserId: targetUserId,
          recipientEmail: targetUser.email,
          channel: NotificationChannel.EMAIL,
          category: NotificationCategory.SECURITY,
          templateName: 'WELCOME_NEW_USER',
          subject: rendered.subject,
          bodyText: rendered.text,
          htmlBody: rendered.html,
          metadata: { tokenHash, activationUrl },
        },
        tx
      );

      if (notif.notificationId) {
        processPendingNotifications({ targetNotificationId: notif.notificationId }).catch(() => { });
      }
    }

    // Revoke sessions
    await tx.session.updateMany({
      where: { userId: targetUserId, revokedAt: null },
      data: { revokedAt: now },
    });

    // Audit trail
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'ADMIN_EMERGENCY_ACCOUNT_RECOVERY',
        entityType: 'User',
        entityId: targetUserId,
        ipAddress,
        newValues: {
          reason: cleanReason,
          unlockAccount: !!input.unlockAccount,
          sendNewActivationLink: !!input.sendNewActivationLink,
        },
      },
    });
  });

  return {
    success: true,
    message: 'Emergency recovery action completed successfully.',
  };
}

/**
 * Resends user activation link with administrative audit logging.
 */
export async function resendUserActivation(
  actor: SafeUser,
  targetUserId: string,
  ipAddress?: string
) {
  return adminEmergencyAccountRecovery(
    actor,
    targetUserId,
    { reason: 'Administrative activation link dispatch requested', sendNewActivationLink: true },
    ipAddress
  );
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

  const mappedTeachers = teachers.map((t) => ({
    ...t,
    staffId: t.staffIdNumber,
    employmentStatus: t.status,
    phonePrimary: t.user?.phoneNumber || '',
  }));

  return { total, limit, offset, teachers: mappedTeachers };
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

  return {
    ...teacher,
    staffId: teacher.staffIdNumber,
    employmentStatus: teacher.status,
    phonePrimary: teacher.user?.phoneNumber || '',
  };
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

/**
 * Creates an authoritative Teacher profile, provisioning or linking the corresponding User account,
 * assigning the TEACHER role, generating an activation token, and dispatching a welcome email.
 */
export async function createAdminTeacher(
  actor: SafeUser,
  input: {
    email: string;
    firstName: string;
    lastName: string;
    phonePrimary?: string;
    staffIdNumber?: string;
    qualification?: string;
    linkExistingUserId?: string;
    scopes?: Array<{
      programmeId: string;
      schoolClassId?: string | null;
      subjectId?: string | null;
      isClassTeacher?: boolean;
    }>;
  },
  ipAddress?: string
) {
  await requirePermission(actor, PermissionCode.TEACHER_MANAGE);

  const normalizedEmail = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Please provide a valid email address.');
  }

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) {
    throw new Error('Teacher first name and last name are required.');
  }

  if (!input.phonePrimary || !input.phonePrimary.trim()) {
    throw new Error('Phone number is mandatory.');
  }

  // 1. Determine staff ID
  let staffId = input.staffIdNumber?.trim();
  if (!staffId) {
    const currentYear = new Date().getFullYear();
    const count = await prisma.teacher.count();
    staffId = `STF-${currentYear}-${String(count + 1).padStart(4, '0')}`;
  }

  const existingStaffId = await prisma.teacher.findUnique({
    where: { staffIdNumber: staffId },
  });
  if (existingStaffId) {
    throw new Error(`Staff ID ${staffId} is already assigned to another educator.`);
  }

  // 2. Resolve User Account
  const teacherRole = await prisma.role.findUnique({
    where: { code: RoleCode.TEACHER },
  });
  if (!teacherRole) {
    throw new Error('TEACHER role definition missing in system.');
  }

  const result = await prisma.$transaction(async (tx) => {
    let targetUserId = input.linkExistingUserId;

    if (targetUserId) {
      const existingUser = await tx.user.findUnique({
        where: { id: targetUserId },
        include: { teacherProfile: true, userRoles: true },
      });
      if (!existingUser) {
        throw new Error('Specified user account does not exist.');
      }
      if (existingUser.teacherProfile) {
        throw new Error('This user account is already linked to another teacher profile.');
      }
      const hasTeacherRole = existingUser.userRoles.some((ur) => ur.roleId === teacherRole.id);
      if (!hasTeacherRole) {
        await tx.userRole.create({
          data: {
            userId: targetUserId,
            roleId: teacherRole.id,
          },
        });
      }
    } else {
      const existingUser = await tx.user.findUnique({
        where: { email: normalizedEmail },
        include: { teacherProfile: true, userRoles: true },
      });

      const rawPhone = input.phonePrimary?.trim();
      if (rawPhone) {
        const existingPhoneUser = await tx.user.findFirst({
          where: { phoneNumber: rawPhone },
          include: { teacherProfile: true },
        });

        if (existingPhoneUser) {
          if (existingPhoneUser.teacherProfile) {
            throw new Error(`This phone number is already registered to teacher "${existingPhoneUser.teacherProfile.firstName} ${existingPhoneUser.teacherProfile.lastName}".`);
          } else if (existingPhoneUser.email.toLowerCase() !== normalizedEmail) {
            throw new Error(`This phone number is already registered to user account "${existingPhoneUser.email}". Please provide a unique phone number.`);
          }
        }
      }

      if (existingUser) {
        if (existingUser.teacherProfile) {
          throw new Error('This email address is already registered to another teacher profile.');
        }
        targetUserId = existingUser.id;
        const hasTeacherRole = existingUser.userRoles.some((ur) => ur.roleId === teacherRole.id);
        if (!hasTeacherRole) {
          await tx.userRole.create({
            data: { userId: targetUserId, roleId: teacherRole.id },
          });
        }
        if (!existingUser.phoneNumber && rawPhone) {
          await tx.user.update({
            where: { id: targetUserId },
            data: { phoneNumber: rawPhone },
          });
        }
      } else {
        const sentinelHash = createUnactivatedPasswordSentinel();
        const { rawToken, tokenHash } = generateSecureToken();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        const createdUser = await tx.user.create({
          data: {
            email: normalizedEmail,
            phoneNumber: rawPhone || null,
            passwordHash: sentinelHash,
            status: UserStatus.PENDING_VERIFICATION,
            userRoles: {
              create: [{ roleId: teacherRole.id }],
            },
            emailVerifications: {
              create: {
                tokenHash,
                email: normalizedEmail,
                tokenType: VerificationTokenType.ACCOUNT_ACTIVATION,
                expiresAt,
              },
            },
          },
        });

        targetUserId = createdUser.id;

        const activationUrl = toAbsoluteEmailUrl(`/auth/activate?token=${rawToken}`);
        const recipientName = `${firstName} ${lastName}`.trim();

        const rendered = renderWelcomeNewUserEmail({
          recipientName,
          roleName: 'Teacher',
          email: normalizedEmail,
          activationUrl,
          expiresInHours: 24,
        });

        const notifResult = await enqueueNotification(
          {
            idempotencyKey: `SECURITY:USER_ACTIVATION:${createdUser.id}:${tokenHash}`,
            recipientUserId: createdUser.id,
            recipientEmail: normalizedEmail,
            channel: NotificationChannel.EMAIL,
            category: NotificationCategory.SECURITY,
            templateName: 'WELCOME_NEW_USER',
            subject: rendered.subject,
            bodyText: rendered.text,
            htmlBody: rendered.html,
            metadata: { tokenHash, activationUrl },
          },
          tx
        );

        if (notifResult.notificationId) {
          processPendingNotifications({ targetNotificationId: notifResult.notificationId }).catch(() => { });
        }
      }
    }

    // 3. Create Teacher Profile
    const teacher = await tx.teacher.create({
      data: {
        userId: targetUserId,
        staffIdNumber: staffId,
        firstName,
        lastName,
        qualification: input.qualification?.trim() || null,
        status: TeacherStatus.ACTIVE,
      },
    });

    // 4. Assign initial scopes if provided
    if (input.scopes && input.scopes.length > 0) {
      let activeSession = await tx.academicSession.findFirst({
        where: { isCurrent: true },
      });
      if (!activeSession) {
        activeSession = await tx.academicSession.findFirst({
          orderBy: { startDate: 'desc' },
        });
      }
      if (activeSession) {
        for (const scope of input.scopes) {
          if (scope.programmeId) {
            await tx.teacherScope.create({
              data: {
                teacherId: teacher.id,
                academicSessionId: activeSession.id,
                programmeId: scope.programmeId,
                schoolClassId: scope.schoolClassId || null,
                subjectId: scope.subjectId || null,
                isFormTeacher: Boolean(scope.isClassTeacher),
              },
            });
          }
        }
      }
    }

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'TEACHER_CREATED',
        entityType: 'Teacher',
        entityId: teacher.id,
        ipAddress,
        newValues: {
          staffId,
          name: `${firstName} ${lastName}`,
          email: normalizedEmail,
          userId: targetUserId,
        },
      },
    });

    return teacher;
  });

  return getAdminTeacherDetails(actor, result.id);
}

export async function updateAdminTeacher(
  actor: SafeUser,
  teacherId: string,
  input: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneNumber?: string;
    staffIdNumber?: string;
    qualification?: string | null;
    position?: string | null;
    department?: string | null;
    status?: TeacherStatus;
    dateOfEmployment?: string | Date | null;
  },
  ipAddress?: string
) {
  await requirePermission(actor, PermissionCode.TEACHER_MANAGE);

  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: { user: true },
  });

  if (!teacher) {
    throw new AuthorizationError('Teacher profile not found.', 404, 'TEACHER_NOT_FOUND');
  }

  // Validate email if changed
  let normalizedEmail: string | undefined = undefined;
  if (input.email !== undefined) {
    normalizedEmail = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error('Please provide a valid email address.');
    }
    if (normalizedEmail !== teacher.user.email.toLowerCase()) {
      const emailConflict = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (emailConflict && emailConflict.id !== teacher.userId) {
        throw new Error('This email address is already in use by another account.');
      }
    }
  }

  // Validate phone if changed
  let normalizedPhone: string | null | undefined = undefined;
  if (input.phoneNumber !== undefined) {
    if (input.phoneNumber && input.phoneNumber.trim()) {
      normalizedPhone = input.phoneNumber.trim();
      if (normalizedPhone !== teacher.user.phoneNumber) {
        const phoneConflict = await prisma.user.findFirst({
          where: { phoneNumber: normalizedPhone },
        });
        if (phoneConflict && phoneConflict.id !== teacher.userId) {
          throw new Error('This phone number is already registered to another user.');
        }
      }
    } else {
      normalizedPhone = null;
    }
  }

  // Validate staffIdNumber if changed
  const staffId = input.staffIdNumber?.trim();
  if (staffId && staffId !== teacher.staffIdNumber) {
    const staffConflict = await prisma.teacher.findUnique({
      where: { staffIdNumber: staffId },
    });
    if (staffConflict && staffConflict.id !== teacher.id) {
      throw new Error(`Staff ID ${staffId} is already assigned to another educator.`);
    }
  }

  await prisma.$transaction(async (tx) => {
    // 1. Update User account (names, email, phone)
    const userUpdateData: any = {};
    if (input.firstName !== undefined) userUpdateData.firstName = input.firstName.trim();
    if (input.lastName !== undefined) userUpdateData.lastName = input.lastName.trim();
    if (normalizedEmail !== undefined) userUpdateData.email = normalizedEmail;
    if (normalizedPhone !== undefined) userUpdateData.phoneNumber = normalizedPhone;

    if (Object.keys(userUpdateData).length > 0) {
      await tx.user.update({
        where: { id: teacher.userId },
        data: userUpdateData,
      });
    }

    // 2. Update Teacher record
    const teacherUpdateData: any = {};
    if (input.firstName !== undefined) teacherUpdateData.firstName = input.firstName.trim();
    if (input.lastName !== undefined) teacherUpdateData.lastName = input.lastName.trim();
    if (staffId !== undefined) teacherUpdateData.staffIdNumber = staffId;
    if (input.qualification !== undefined) teacherUpdateData.qualification = input.qualification?.trim() || null;
    if (input.position !== undefined) teacherUpdateData.position = input.position?.trim() || null;
    if (input.department !== undefined) teacherUpdateData.department = input.department?.trim() || null;
    if (input.status !== undefined) teacherUpdateData.status = input.status;
    if (input.dateOfEmployment !== undefined) {
      teacherUpdateData.dateOfEmployment = input.dateOfEmployment ? new Date(input.dateOfEmployment) : null;
    }

    const updated = await tx.teacher.update({
      where: { id: teacher.id },
      data: teacherUpdateData,
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'TEACHER_UPDATED',
        entityType: 'Teacher',
        entityId: teacher.id,
        ipAddress,
        oldValues: {
          name: `${teacher.firstName} ${teacher.lastName}`,
          email: teacher.user.email,
          phone: teacher.user.phoneNumber,
          staffId: teacher.staffIdNumber,
          status: teacher.status,
          qualification: teacher.qualification,
          position: teacher.position,
          department: teacher.department,
        },
        newValues: {
          name: `${updated.firstName} ${updated.lastName}`,
          email: normalizedEmail || teacher.user.email,
          phone: normalizedPhone !== undefined ? normalizedPhone : teacher.user.phoneNumber,
          staffId: staffId || teacher.staffIdNumber,
          status: updated.status,
          qualification: updated.qualification,
          position: updated.position,
          department: updated.department,
        },
      },
    });

    return updated;
  });

  return getAdminTeacherDetails(actor, teacher.id);
}

// ==========================================
// 4. ATTENDANCE OVERSIGHT & CORRECTION
// ==========================================

export async function getAdminAttendanceOverview(
  actor: SafeUser,
  options: {
    date?: string | Date;
    startDate?: string | Date;
    endDate?: string | Date;
    programmeId?: string;
    schoolClassId?: string;
  }
) {
  await requirePermission(actor, PermissionCode.ATTENDANCE_VIEW);

  const where: Prisma.AttendanceRecordWhereInput = {
    ...(options.programmeId && { programmeId: options.programmeId }),
    ...(options.schoolClassId && { schoolClassId: options.schoolClassId }),
  };

  let normalizedDate: Date;
  if (options.startDate && options.endDate) {
    const { date: normStart } = normalizeAttendanceDate(options.startDate);
    const { date: normEnd } = normalizeAttendanceDate(options.endDate);
    where.date = { gte: normStart, lte: normEnd };
    normalizedDate = normStart;
  } else if (options.date) {
    const norm = normalizeAttendanceDate(options.date);
    normalizedDate = norm.date;
    where.date = normalizedDate;
  } else {
    const norm = normalizeAttendanceDate(new Date());
    normalizedDate = norm.date;
    where.date = normalizedDate;
  }

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
