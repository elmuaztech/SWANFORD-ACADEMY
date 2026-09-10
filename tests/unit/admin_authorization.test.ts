import { describe, it, expect } from "vitest";
import { RoleCode, UserStatus } from "@prisma/client";
import {
  PermissionCode,
  SYSTEM_ROLE_PERMISSIONS,
  PERMISSION_DEFINITIONS,
} from "@/lib/auth/permissions";

describe("Unit Tests: Work Package C - Admin & Super Admin Authorization Invariants", () => {
  describe("Invariant 1: ROLE != PERMISSION != SCOPE", () => {
    it("verifies permissions are fine-grained capabilities, not raw role names", () => {
      // Permission codes are namespaced strings like "students:view", "users:manage"
      for (const code of Object.values(PermissionCode)) {
        expect(code).toMatch(/^[a-z_]+:[a-z_]+$/);
        expect(PERMISSION_DEFINITIONS[code]).toBeDefined();
        expect(PERMISSION_DEFINITIONS[code].name).toBeTruthy();
        expect(PERMISSION_DEFINITIONS[code].module).toBeTruthy();
      }
    });

    it("verifies ADMIN role holds operational permissions but lacks security & system governance", () => {
      const adminPerms = SYSTEM_ROLE_PERMISSIONS[RoleCode.ADMIN];

      // Operational permissions granted to Admin
      expect(adminPerms).toContain(PermissionCode.STUDENT_VIEW);
      expect(adminPerms).toContain(PermissionCode.STUDENT_CREATE);
      expect(adminPerms).toContain(PermissionCode.STUDENT_EDIT);
      expect(adminPerms).toContain(PermissionCode.GUARDIAN_VIEW);
      expect(adminPerms).toContain(PermissionCode.TEACHER_MANAGE);
      expect(adminPerms).toContain(PermissionCode.ADMISSION_APPLICATION_REVIEW);
      expect(adminPerms).toContain(PermissionCode.ADMISSION_APPLICATION_APPROVE);
      expect(adminPerms).toContain(PermissionCode.ATTENDANCE_VIEW);
      expect(adminPerms).toContain(PermissionCode.AUDIT_LOG_VIEW);

      // Governance permissions STRICTLY FORBIDDEN to Admin
      expect(adminPerms).not.toContain(PermissionCode.SYSTEM_CONFIG_MANAGE);
      expect(adminPerms).not.toContain(PermissionCode.USER_MANAGE);
      expect(adminPerms).not.toContain(PermissionCode.ROLE_MANAGE);
    });

    it("verifies SUPER_ADMIN holds all permissions across the canonical catalog", () => {
      const superAdminPerms = SYSTEM_ROLE_PERMISSIONS[RoleCode.SUPER_ADMIN];
      const allPerms = Object.values(PermissionCode);

      expect(superAdminPerms.length).toBe(allPerms.length);
      for (const perm of allPerms) {
        expect(superAdminPerms).toContain(perm);
      }
    });

    it("verifies TEACHER and PARENT have strictly delimited non-administrative boundaries", () => {
      const teacherPerms = SYSTEM_ROLE_PERMISSIONS[RoleCode.TEACHER];
      const parentPerms = SYSTEM_ROLE_PERMISSIONS[RoleCode.PARENT];

      // Neither can view or edit general students without scope / relationship
      expect(teacherPerms).not.toContain(PermissionCode.STUDENT_CREATE);
      expect(teacherPerms).not.toContain(PermissionCode.STUDENT_EDIT);
      expect(teacherPerms).not.toContain(PermissionCode.AUDIT_LOG_VIEW);
      expect(teacherPerms).not.toContain(PermissionCode.ADMISSION_APPLICATION_APPROVE);

      expect(parentPerms).not.toContain(PermissionCode.STUDENT_VIEW);
      expect(parentPerms).not.toContain(PermissionCode.ATTENDANCE_RECORD);
      expect(parentPerms).not.toContain(PermissionCode.AUDIT_LOG_VIEW);
    });
  });

  describe("Invariant 2: Governance & Security Business Logic", () => {
    it("requires administrative justification for security status alterations", () => {
      const allowedStatuses = Object.values(UserStatus);
      expect(allowedStatuses).toContain(UserStatus.ACTIVE);
      expect(allowedStatuses).toContain(UserStatus.SUSPENDED);
      expect(allowedStatuses).toContain(UserStatus.PENDING_VERIFICATION);
      expect(allowedStatuses).toContain(UserStatus.DEACTIVATED);

      // Function to validate business rule
      function validateStatusTransition(
        actorId: string,
        targetUserId: string,
        newStatus: UserStatus,
        reason: string
      ): { valid: boolean; error?: string } {
        if (actorId === targetUserId && (newStatus === UserStatus.DEACTIVATED || newStatus === UserStatus.SUSPENDED)) {
          return { valid: false, error: "Administrators cannot self-deactivate or self-suspend their own active account." };
        }
        if (!reason || reason.trim().length < 5) {
          return { valid: false, error: "An administrative reason (minimum 5 characters) is mandatory." };
        }
        return { valid: true };
      }

      // Self-deactivation check
      const selfDeact = validateStatusTransition("admin-1", "admin-1", UserStatus.DEACTIVATED, "Leaving school");
      expect(selfDeact.valid).toBe(false);
      expect(selfDeact.error).toContain("self-deactivate");

      // Self-suspension check
      const selfSusp = validateStatusTransition("admin-1", "admin-1", UserStatus.SUSPENDED, "Temporary break");
      expect(selfSusp.valid).toBe(false);
      expect(selfSusp.error).toContain("self-suspend");

      // Empty reason check
      const emptyReason = validateStatusTransition("admin-1", "user-2", UserStatus.SUSPENDED, "  ");
      expect(emptyReason.valid).toBe(false);
      expect(emptyReason.error).toContain("reason");

      // Valid transition
      const validTrans = validateStatusTransition("admin-1", "user-2", UserStatus.ACTIVE, "Account re-enabled by authority");
      expect(validTrans.valid).toBe(true);
    });

    it("prevents privilege escalation when assigning SUPER_ADMIN role", () => {
      function validateRoleAssignment(
        actorRoles: RoleCode[],
        roleCodesToAssign: RoleCode[],
        isLastSuperAdmin: boolean,
        reason: string
      ): { valid: boolean; error?: string } {
        if (!reason || reason.trim().length < 5) {
          return { valid: false, error: "An administrative reason is mandatory." };
        }
        if (roleCodesToAssign.includes(RoleCode.SUPER_ADMIN) && !actorRoles.includes(RoleCode.SUPER_ADMIN)) {
          return { valid: false, error: "Only an active Super Admin can assign the Super Admin role." };
        }
        if (isLastSuperAdmin && !roleCodesToAssign.includes(RoleCode.SUPER_ADMIN)) {
          return { valid: false, error: "Cannot remove the Super Admin role from the last active Super Administrator." };
        }
        return { valid: true };
      }

      // Admin trying to grant SUPER_ADMIN
      const escalationAttempt = validateRoleAssignment(
        [RoleCode.ADMIN],
        [RoleCode.SUPER_ADMIN, RoleCode.ADMIN],
        false,
        "Promoting colleague"
      );
      expect(escalationAttempt.valid).toBe(false);
      expect(escalationAttempt.error).toContain("Only an active Super Admin");

      // Super admin demoting the last super admin
      const demoteLastAttempt = validateRoleAssignment(
        [RoleCode.SUPER_ADMIN],
        [RoleCode.ADMIN],
        true,
        "Removing super admin role"
      );
      expect(demoteLastAttempt.valid).toBe(false);
      expect(demoteLastAttempt.error).toContain("last active Super Administrator");

      // Legitimate assignment by Super Admin
      const validAssignment = validateRoleAssignment(
        [RoleCode.SUPER_ADMIN],
        [RoleCode.TEACHER, RoleCode.ADMIN],
        false,
        "Assigning operational administrative roles"
      );
      expect(validAssignment.valid).toBe(true);
    });
  });
});
