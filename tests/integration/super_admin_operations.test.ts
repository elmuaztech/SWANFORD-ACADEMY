import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RoleCode, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getSuperAdminDashboardMetrics,
  updateUserAccountStatus,
  assignUserRoles,
  listAuditLogs,
} from "@/lib/admin/admin_service";
import { hashPassword } from "@/lib/auth/password";
import { sanitizeUser, SafeUser } from "@/lib/auth/service";

describe("Integration Tests: Work Package C - Super Admin Governance Operations", () => {
  let superAdmin1: SafeUser;
  let superAdmin2: SafeUser;
  let adminActor: SafeUser;
  let targetUser: SafeUser;

  beforeAll(async () => {
    const superAdminRole = await prisma.role.findUnique({ where: { code: RoleCode.SUPER_ADMIN } });
    const adminRole = await prisma.role.findUnique({ where: { code: RoleCode.ADMIN } });
    const teacherRole = await prisma.role.findUnique({ where: { code: RoleCode.TEACHER } });

    if (!superAdminRole || !adminRole || !teacherRole) {
      throw new Error("Roles missing in seed.");
    }

    const passHash = await hashPassword("SuperSecret2026!");

    // 1. Super Admin 1
    const u1 = await prisma.user.create({
      data: {
        email: `super1.${Date.now()}@swanford.test`,
        passwordHash: passHash,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: superAdminRole.id } },
      },
      include: { userRoles: { include: { role: true } } },
    });
    superAdmin1 = sanitizeUser(u1);

    // 2. Super Admin 2 (so we can test role removal without deleting last super admin)
    const u2 = await prisma.user.create({
      data: {
        email: `super2.${Date.now()}@swanford.test`,
        passwordHash: passHash,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: superAdminRole.id } },
      },
      include: { userRoles: { include: { role: true } } },
    });
    superAdmin2 = sanitizeUser(u2);

    // 3. Admin Actor
    const u3 = await prisma.user.create({
      data: {
        email: `admin.actor.${Date.now()}@swanford.test`,
        passwordHash: passHash,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: adminRole.id } },
      },
      include: { userRoles: { include: { role: true } } },
    });
    adminActor = sanitizeUser(u3);

    // 4. Target User
    const u4 = await prisma.user.create({
      data: {
        email: `target.user.${Date.now()}@swanford.test`,
        passwordHash: passHash,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: teacherRole.id } },
      },
      include: { userRoles: { include: { role: true } } },
    });
    targetUser = sanitizeUser(u4);
  });

  afterAll(async () => {
    const userIds = [superAdmin1.id, superAdmin2.id, adminActor.id, targetUser.id];
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("retrieves telemetry and governance dashboard metrics", async () => {
    const metrics = await getSuperAdminDashboardMetrics(superAdmin1);

    expect(metrics).toBeDefined();
    expect(metrics.usersByStatus).toBeDefined();
    expect(metrics.usersByStatus[UserStatus.ACTIVE]).toBeGreaterThanOrEqual(2);

    expect(metrics.usersByRole).toBeDefined();
    expect(metrics.usersByRole[RoleCode.SUPER_ADMIN]).toBeGreaterThanOrEqual(2);

    expect(metrics.notificationsByStatus).toBeDefined();
    expect(typeof metrics.totalAuditLogs).toBe("number");
    expect(Array.isArray(metrics.recentSecurityLogs)).toBe(true);
  });

  it("updates user status and blocks self-deactivation", async () => {
    // 1. Attempt self-deactivation
    await expect(
      updateUserAccountStatus(superAdmin1, superAdmin1.id, "DEACTIVATE")
    ).rejects.toThrow(/Cannot deactivate your own active user account/);

    // 2. Legitimate deactivation of target user
    const updated = await updateUserAccountStatus(superAdmin1, targetUser.id, "DEACTIVATE");

    expect(updated.status).toBe(UserStatus.DEACTIVATED);

    // Verify audit log created
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: "ACCOUNT_DEACTIVATED",
        entityId: targetUser.id,
      },
    });
    expect(audit).toBeDefined();
    expect(audit?.userId).toBe(superAdmin1.id);
    expect(JSON.stringify(audit?.newValues)).toContain("DEACTIVATED");

    // Restore target user
    await updateUserAccountStatus(superAdmin1, targetUser.id, "ACTIVATE");
  });

  it("prevents privilege escalation when non-superadmin attempts to grant SUPER_ADMIN", async () => {
    // Non-superadmin adminActor attempts to grant SUPER_ADMIN
    await expect(
      assignUserRoles(adminActor, targetUser.id, [RoleCode.SUPER_ADMIN, RoleCode.TEACHER])
    ).rejects.toThrow(/Only existing Super Admins can grant the Super Admin role/);
  });

  it("allows a superadmin to grant and modify user roles with audit trail", async () => {
    const updatedRoles = await assignUserRoles(superAdmin1, targetUser.id, [
      RoleCode.TEACHER,
      RoleCode.ACCOUNTANT,
    ]);

    const roleCodes = updatedRoles.map((r) => r.code);
    expect(roleCodes).toContain(RoleCode.TEACHER);
    expect(roleCodes).toContain(RoleCode.ACCOUNTANT);

    // Verify audit log
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: "USER_ROLES_UPDATED",
        entityId: targetUser.id,
      },
    });
    expect(audit).toBeDefined();
    expect(audit?.userId).toBe(superAdmin1.id);
    expect(JSON.stringify(audit?.newValues)).toContain("ACCOUNTANT");
  });

  it("queries the immutable audit log with filters and pagination", async () => {
    const result = await listAuditLogs(superAdmin1, {
      limit: 10,
      offset: 0,
      action: "USER_ROLES_UPDATED",
    });

    expect(result).toBeDefined();
    expect(result.limit).toBe(10);
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(result.logs)).toBe(true);

    const firstItem = result.logs[0];
    expect(firstItem.action).toBe("USER_ROLES_UPDATED");
    expect(firstItem.user).toBeDefined();
  });
});
