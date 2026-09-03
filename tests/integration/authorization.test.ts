import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RoleCode, UserStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  getUserPermissions,
  hasPermission,
  requirePermission,
  AuthorizationError,
} from '@/lib/auth/authorization';
import { assignRoleToUser, removeRoleFromUser } from '@/lib/auth/role_service';
import { PermissionCode } from '@/lib/auth/permissions';
import { hashPassword } from '@/lib/auth/password';

describe('Integration Tests: Centralized Authorization & Role Lifecycle', () => {
  let superAdminUser: { id: string; email: string };
  let testUser: { id: string; email: string };
  let standardTeacherUser: { id: string; email: string };

  beforeAll(async () => {
    // 1. Ensure Super Admin role exists
    const superAdminRole = await prisma.role.findUnique({
      where: { code: RoleCode.SUPER_ADMIN },
    });
    if (!superAdminRole) {
      throw new Error('Super Admin role not seeded.');
    }

    // 2. Create a clean Super Admin test user
    const superAdminPasswordHash = await hashPassword('SuperAdmin@Swanford2026!');
    superAdminUser = await prisma.user.create({
      data: {
        email: 'stage4.superadmin@swanford.internal',
        passwordHash: superAdminPasswordHash,
        status: UserStatus.ACTIVE,
        userRoles: {
          create: {
            roleId: superAdminRole.id,
          },
        },
      },
    });

    // 3. Create a clean general test user (initially without roles)
    const testPasswordHash = await hashPassword('TestUser@Swanford2026!');
    testUser = await prisma.user.create({
      data: {
        email: 'stage4.testuser@swanford.internal',
        passwordHash: testPasswordHash,
        status: UserStatus.ACTIVE,
      },
    });

    // 4. Create a standard Teacher user
    const teacherRole = await prisma.role.findUnique({
      where: { code: RoleCode.TEACHER },
    });
    standardTeacherUser = await prisma.user.create({
      data: {
        email: 'stage4.teacher@swanford.internal',
        passwordHash: testPasswordHash,
        status: UserStatus.ACTIVE,
        userRoles: {
          create: {
            roleId: teacherRole!.id,
          },
        },
      },
    });
  });

  afterAll(async () => {
    // Clean up created test users and audit logs
    await prisma.auditLog.deleteMany({
      where: {
        userId: { in: [superAdminUser.id, testUser.id, standardTeacherUser.id] },
      },
    });
    await prisma.userRole.deleteMany({
      where: {
        userId: { in: [superAdminUser.id, testUser.id, standardTeacherUser.id] },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [superAdminUser.id, testUser.id, standardTeacherUser.id] },
      },
    });
  });

  it('Super Admin possesses all permissions and passes permission check', async () => {
    const hasAuditPerm = await hasPermission(superAdminUser.id, PermissionCode.AUDIT_LOG_VIEW);
    const hasRolePerm = await hasPermission(superAdminUser.id, PermissionCode.ROLE_MANAGE);
    const hasFinancePerm = await hasPermission(superAdminUser.id, PermissionCode.FINANCE_INVOICE_MANAGE);

    expect(hasAuditPerm).toBe(true);
    expect(hasRolePerm).toBe(true);
    expect(hasFinancePerm).toBe(true);

    await expect(requirePermission(superAdminUser.id, PermissionCode.SYSTEM_CONFIG_MANAGE)).resolves.not.toThrow();
  });

  it('Teacher has instructional permissions but is denied administrative/finance permissions', async () => {
    const hasAttendRecord = await hasPermission(standardTeacherUser.id, PermissionCode.ATTENDANCE_RECORD);
    const hasAssessEnter = await hasPermission(standardTeacherUser.id, PermissionCode.ASSESSMENT_ENTER);
    const hasInvoiceManage = await hasPermission(standardTeacherUser.id, PermissionCode.FINANCE_INVOICE_MANAGE);
    const hasRoleManage = await hasPermission(standardTeacherUser.id, PermissionCode.ROLE_MANAGE);

    expect(hasAttendRecord).toBe(true);
    expect(hasAssessEnter).toBe(true);
    expect(hasInvoiceManage).toBe(false);
    expect(hasRoleManage).toBe(false);

    await expect(
      requirePermission(standardTeacherUser.id, PermissionCode.FINANCE_INVOICE_MANAGE)
    ).rejects.toThrow(AuthorizationError);
  });

  it('correctly computes union of permissions for multi-role users', async () => {
    // Initially, testUser has 0 roles and 0 permissions
    let perms = await getUserPermissions(testUser.id);
    expect(perms.size).toBe(0);

    // 1. Assign TEACHER role to testUser
    await assignRoleToUser(superAdminUser.id, testUser.id, RoleCode.TEACHER);
    perms = await getUserPermissions(testUser.id);
    expect(perms.has(PermissionCode.ATTENDANCE_RECORD)).toBe(true);
    expect(perms.has(PermissionCode.FINANCE_INVOICE_MANAGE)).toBe(false);

    // 2. Assign ACCOUNTANT role to testUser (User is now BOTH Teacher AND Accountant)
    await assignRoleToUser(superAdminUser.id, testUser.id, RoleCode.ACCOUNTANT);
    perms = await getUserPermissions(testUser.id);
    expect(perms.has(PermissionCode.ATTENDANCE_RECORD)).toBe(true);
    expect(perms.has(PermissionCode.FINANCE_INVOICE_MANAGE)).toBe(true);
    expect(perms.has(PermissionCode.FINANCE_PAYMENT_RECONCILE)).toBe(true);

    // 3. Remove ACCOUNTANT role from testUser
    await removeRoleFromUser(superAdminUser.id, testUser.id, RoleCode.ACCOUNTANT);
    perms = await getUserPermissions(testUser.id);
    expect(perms.has(PermissionCode.ATTENDANCE_RECORD)).toBe(true);
    expect(perms.has(PermissionCode.FINANCE_INVOICE_MANAGE)).toBe(false);
    expect(perms.has(PermissionCode.FINANCE_PAYMENT_RECONCILE)).toBe(false);
  });

  it('enforces account status lifecycle: DEACTIVATED, LOCKED, SUSPENDED, PENDING_VERIFICATION', async () => {
    // 1. Deactivated user fails authorization immediately
    await prisma.user.update({
      where: { id: testUser.id },
      data: { status: UserStatus.DEACTIVATED },
    });

    await expect(getUserPermissions(testUser.id)).rejects.toMatchObject({
      code: 'ACCOUNT_DEACTIVATED',
      statusCode: 403,
    });

    // 2. Locked user fails authorization immediately
    await prisma.user.update({
      where: { id: testUser.id },
      data: {
        status: UserStatus.ACTIVE,
        lockedUntil: new Date(Date.now() + 15 * 60 * 1000), // 15 mins in future
      },
    });

    await expect(getUserPermissions(testUser.id)).rejects.toMatchObject({
      code: 'ACCOUNT_LOCKED',
      statusCode: 423,
    });

    // 3. Suspended user fails authorization immediately
    await prisma.user.update({
      where: { id: testUser.id },
      data: {
        status: UserStatus.SUSPENDED,
        lockedUntil: null,
      },
    });

    await expect(getUserPermissions(testUser.id)).rejects.toMatchObject({
      code: 'ACCOUNT_SUSPENDED',
      statusCode: 403,
    });

    // 4. Pending verification user fails authorization immediately
    await prisma.user.update({
      where: { id: testUser.id },
      data: {
        status: UserStatus.PENDING_VERIFICATION,
        lockedUntil: null,
      },
    });

    await expect(getUserPermissions(testUser.id)).rejects.toMatchObject({
      code: 'ACCOUNT_PENDING_ACTIVATION',
      statusCode: 403,
    });

    // Restore testUser to ACTIVE
    await prisma.user.update({
      where: { id: testUser.id },
      data: {
        status: UserStatus.ACTIVE,
        lockedUntil: null,
      },
    });
  });

  it('audits role assignment operations and blocks unauthorized users from assigning roles', async () => {
    // Unauthorized teacher attempts to assign ADMIN role to testUser -> FAILS
    await expect(
      assignRoleToUser(standardTeacherUser.id, testUser.id, RoleCode.ADMIN)
    ).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      statusCode: 403,
    });

    // Super Admin assigns ADMIN role to testUser -> SUCCEEDS and creates AuditLog
    await assignRoleToUser(superAdminUser.id, testUser.id, RoleCode.ADMIN);

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        userId: superAdminUser.id,
        action: 'ROLE_ASSIGNED',
        entityType: 'UserRole',
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(auditLog).toBeDefined();
    expect(auditLog!.newValues).toMatchObject({
      targetUserId: testUser.id,
      roleCode: RoleCode.ADMIN,
    });
  });

  it('prevents removing the last Super Administrator', async () => {
    const superAdminRole = await prisma.role.findUniqueOrThrow({
      where: { code: RoleCode.SUPER_ADMIN },
    });
    const allSuperAdmins = await prisma.userRole.findMany({
      where: { roleId: superAdminRole.id },
    });

    // Remove extra super admins until exactly 1 remains
    for (let i = 0; i < allSuperAdmins.length - 1; i++) {
      await prisma.userRole.delete({
        where: {
          userId_roleId: {
            userId: allSuperAdmins[i].userId,
            roleId: superAdminRole.id,
          },
        },
      });
    }

    const lastSuperAdmin = allSuperAdmins[allSuperAdmins.length - 1];

    // Attempting to remove the last remaining Super Admin must throw error
    await expect(
      removeRoleFromUser(lastSuperAdmin.userId, lastSuperAdmin.userId, RoleCode.SUPER_ADMIN)
    ).rejects.toMatchObject({
      code: 'LAST_SUPER_ADMIN_PROTECTED',
      statusCode: 400,
    });
  });
});
