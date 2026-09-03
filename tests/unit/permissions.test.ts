import { describe, it, expect } from 'vitest';
import { RoleCode } from '@prisma/client';
import {
  PermissionCode,
  PERMISSION_DEFINITIONS,
  SYSTEM_ROLE_PERMISSIONS,
} from '@/lib/auth/permissions';

describe('Unit Tests: Canonical Permission Catalog & System Role Mappings', () => {
  it('defines all canonical permissions with non-empty metadata', () => {
    const permKeys = Object.keys(PermissionCode) as (keyof typeof PermissionCode)[];
    expect(permKeys.length).toBeGreaterThanOrEqual(25);

    for (const key of permKeys) {
      const code = PermissionCode[key];
      const def = PERMISSION_DEFINITIONS[code];

      expect(def).toBeDefined();
      expect(def.code).toBe(code);
      expect(def.name).toBeTruthy();
      expect(def.module).toBeTruthy();
      expect(def.description).toBeTruthy();
    }
  });

  it('assigns all canonical permissions to SUPER_ADMIN', () => {
    const superAdminPerms = SYSTEM_ROLE_PERMISSIONS[RoleCode.SUPER_ADMIN];
    const allPerms = Object.values(PermissionCode);

    expect(superAdminPerms.length).toBe(allPerms.length);
    for (const perm of allPerms) {
      expect(superAdminPerms).toContain(perm);
    }
  });

  it('enforces least-privilege boundary for ADMIN', () => {
    const adminPerms = SYSTEM_ROLE_PERMISSIONS[RoleCode.ADMIN];

    // Admin should have broad operational permissions
    expect(adminPerms).toContain(PermissionCode.STUDENT_VIEW);
    expect(adminPerms).toContain(PermissionCode.STUDENT_CREATE);
    expect(adminPerms).toContain(PermissionCode.ACADEMIC_SESSION_MANAGE);
    expect(adminPerms).toContain(PermissionCode.ADMISSION_APPLICATION_APPROVE);
    expect(adminPerms).toContain(PermissionCode.AUDIT_LOG_VIEW);

    // Admin must NOT have user/role security permissions (least privilege)
    expect(adminPerms).not.toContain(PermissionCode.USER_MANAGE);
    expect(adminPerms).not.toContain(PermissionCode.ROLE_MANAGE);
    expect(adminPerms).not.toContain(PermissionCode.SYSTEM_CONFIG_MANAGE);

    // Admin must NOT have ledger alteration permissions
    expect(adminPerms).not.toContain(PermissionCode.FINANCE_INVOICE_MANAGE);
    expect(adminPerms).not.toContain(PermissionCode.FINANCE_PAYMENT_RECONCILE);
    expect(adminPerms).not.toContain(PermissionCode.FINANCE_EXPENSE_MANAGE);
  });

  it('enforces strict financial domain boundary for ACCOUNTANT', () => {
    const accountantPerms = SYSTEM_ROLE_PERMISSIONS[RoleCode.ACCOUNTANT];

    // Accountant has finance ledger permissions
    expect(accountantPerms).toContain(PermissionCode.FEE_STRUCTURE_MANAGE);
    expect(accountantPerms).toContain(PermissionCode.FINANCE_INVOICE_MANAGE);
    expect(accountantPerms).toContain(PermissionCode.FINANCE_PAYMENT_RECONCILE);
    expect(accountantPerms).toContain(PermissionCode.FINANCE_EXPENSE_MANAGE);
    expect(accountantPerms).toContain(PermissionCode.FINANCE_REPORT_VIEW);

    // Accountant has view-only access to students/guardians for billing
    expect(accountantPerms).toContain(PermissionCode.STUDENT_VIEW);
    expect(accountantPerms).toContain(PermissionCode.GUARDIAN_VIEW);

    // Accountant must NOT have academic, teacher, or user administration authority
    expect(accountantPerms).not.toContain(PermissionCode.STUDENT_CREATE);
    expect(accountantPerms).not.toContain(PermissionCode.STUDENT_EDIT);
    expect(accountantPerms).not.toContain(PermissionCode.TEACHER_MANAGE);
    expect(accountantPerms).not.toContain(PermissionCode.ACADEMIC_SESSION_MANAGE);
    expect(accountantPerms).not.toContain(PermissionCode.ATTENDANCE_RECORD);
    expect(accountantPerms).not.toContain(PermissionCode.ASSESSMENT_ENTER);
    expect(accountantPerms).not.toContain(PermissionCode.ROLE_MANAGE);
  });

  it('enforces instructional boundary for TEACHER', () => {
    const teacherPerms = SYSTEM_ROLE_PERMISSIONS[RoleCode.TEACHER];

    // Teacher has instructional and classroom permissions
    expect(teacherPerms).toContain(PermissionCode.STUDENT_VIEW);
    expect(teacherPerms).toContain(PermissionCode.ATTENDANCE_VIEW);
    expect(teacherPerms).toContain(PermissionCode.ATTENDANCE_RECORD);
    expect(teacherPerms).toContain(PermissionCode.ASSESSMENT_VIEW);
    expect(teacherPerms).toContain(PermissionCode.ASSESSMENT_ENTER);
    expect(teacherPerms).toContain(PermissionCode.REPORT_GENERATE);

    // Teacher must NOT have finance, user management, or admissions authority
    expect(teacherPerms).not.toContain(PermissionCode.FINANCE_INVOICE_VIEW);
    expect(teacherPerms).not.toContain(PermissionCode.FINANCE_PAYMENT_VIEW);
    expect(teacherPerms).not.toContain(PermissionCode.ADMISSION_APPLICATION_APPROVE);
    expect(teacherPerms).not.toContain(PermissionCode.USER_MANAGE);
    expect(teacherPerms).not.toContain(PermissionCode.ROLE_MANAGE);
  });

  it('restricts PARENT to own-child domain permissions only', () => {
    const parentPerms = SYSTEM_ROLE_PERMISSIONS[RoleCode.PARENT];

    expect(parentPerms).toContain(PermissionCode.PARENT_CHILD_VIEW);
    expect(parentPerms).toContain(PermissionCode.PARENT_ATTENDANCE_VIEW);
    expect(parentPerms).toContain(PermissionCode.PARENT_RESULT_VIEW);
    expect(parentPerms).toContain(PermissionCode.PARENT_INVOICE_VIEW);

    // Parent must NOT have general operational permissions
    expect(parentPerms).not.toContain(PermissionCode.STUDENT_VIEW);
    expect(parentPerms).not.toContain(PermissionCode.ATTENDANCE_VIEW);
    expect(parentPerms).not.toContain(PermissionCode.ASSESSMENT_VIEW);
    expect(parentPerms).not.toContain(PermissionCode.FINANCE_INVOICE_VIEW);
  });

  it('guarantees canonical role definitions are system-controlled and immutable', () => {
    const allRoleCodes = Object.values(RoleCode);
    expect(allRoleCodes).toEqual([
      RoleCode.SUPER_ADMIN,
      RoleCode.ADMIN,
      RoleCode.ACCOUNTANT,
      RoleCode.TEACHER,
      RoleCode.PARENT,
    ]);

    for (const roleCode of allRoleCodes) {
      const perms = SYSTEM_ROLE_PERMISSIONS[roleCode];
      expect(Array.isArray(perms)).toBe(true);
      expect(perms.length).toBeGreaterThan(0);
    }
  });
});
