import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { RoleCode, UserStatus } from "@prisma/client";
import { getUserPermissions } from "@/lib/auth/authorization";
import { PermissionCode } from "@/lib/auth/permissions";
import { POST as adminAssessmentsPost } from "@/app/api/admin/assessments/route";
import { POST as teacherAssessmentsPost } from "@/app/api/teacher/assessments/route";
import { NextRequest } from "next/server";
import { loginUser } from "@/lib/auth/service";
import { hashPassword } from "@/lib/auth/password";
import { RECONCILIATION_TARGETS } from "@/../scripts/recover_user_roles";

describe("Phase 2 — Authorization, Assessments & Role Recovery Safety Gate", () => {
  let adminToken: string;
  let teacherToken: string;

  let testSuperAdminId: string;
  let testAdminId: string;
  let testTeacherId: string;
  let testParentId: string;

  let testProgrammeId: string;
  let testClassId: string;
  let testSubjectId: string;

  const testPassword = "Phase2SecurePassword2026!";

  beforeAll(async () => {
    const hashedPassword = await hashPassword(testPassword);

    const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.SUPER_ADMIN } });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.ADMIN } });
    const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.TEACHER } });
    const parentRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.PARENT } });

    // 1. Create Test Super Admin
    const superAdminUser = await prisma.user.create({
      data: {
        email: `phase2.superadmin.${Date.now()}@example.com`,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: {
          create: [{ roleId: superAdminRole.id }, { roleId: adminRole.id }],
        },
      },
    });
    testSuperAdminId = superAdminUser.id;

    // 2. Create Test Ordinary Admin
    const adminUser = await prisma.user.create({
      data: {
        email: `phase2.admin.${Date.now()}@example.com`,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: {
          create: [{ roleId: adminRole.id }],
        },
      },
    });
    testAdminId = adminUser.id;
    const adminLogin = await loginUser({ email: adminUser.email, password: testPassword, ipAddress: "127.0.0.1", userAgent: "Vitest-Test" });
    adminToken = adminLogin.sessionToken!;

    // 3. Create Test Teacher
    const teacherUser = await prisma.user.create({
      data: {
        email: `phase2.teacher.${Date.now()}@example.com`,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: {
          create: [{ roleId: teacherRole.id }],
        },
      },
    });
    testTeacherId = teacherUser.id;
    await prisma.teacher.create({
      data: {
        userId: teacherUser.id,
        staffIdNumber: `STF-P2-${Date.now()}`,
        firstName: "Test",
        lastName: "Instructor",
      },
    });
    const teacherLogin = await loginUser({ email: teacherUser.email, password: testPassword, ipAddress: "127.0.0.1", userAgent: "Vitest-Test" });
    teacherToken = teacherLogin.sessionToken!;

    // 4. Create Test Parent
    const parentUser = await prisma.user.create({
      data: {
        email: `phase2.parent.${Date.now()}@example.com`,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: {
          create: [{ roleId: parentRole.id }],
        },
      },
    });
    testParentId = parentUser.id;
    await prisma.guardian.create({
      data: {
        userId: parentUser.id,
        firstName: "Test",
        lastName: "Guardian",
        email: parentUser.email,
        phonePrimary: "+2348000000002",
      },
    });

    // Create Academic Fixtures
    const prog = await prisma.programme.create({
      data: {
        name: `P2-Prog-${Date.now()}`,
        code: `P2-${Date.now().toString().slice(-4)}`,
      },
    });
    testProgrammeId = prog.id;

    const cls = await prisma.schoolClass.create({
      data: {
        name: `P2-Class-${Date.now()}`,
        code: `CLS-${Date.now().toString().slice(-4)}`,
        programmeId: prog.id,
      },
    });
    testClassId = cls.id;

    const sub = await prisma.subject.create({
      data: {
        name: `P2-Subject-${Date.now()}`,
        code: `SUB-${Date.now().toString().slice(-4)}`,
        programmeId: prog.id,
      },
    });
    testSubjectId = sub.id;
  });

  afterAll(async () => {
    // Clean up test fixtures safely in dependency order
    if (testSubjectId) await prisma.subject.delete({ where: { id: testSubjectId } }).catch(() => {});
    if (testClassId) await prisma.schoolClass.delete({ where: { id: testClassId } }).catch(() => {});
    if (testProgrammeId) await prisma.programme.delete({ where: { id: testProgrammeId } }).catch(() => {});

    if (testTeacherId) await prisma.teacher.deleteMany({ where: { userId: testTeacherId } }).catch(() => {});
    if (testParentId) await prisma.guardian.deleteMany({ where: { userId: testParentId } }).catch(() => {});

    const userIds = [testSuperAdminId, testAdminId, testTeacherId, testParentId].filter(Boolean);
    if (userIds.length > 0) {
      await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      }).catch(() => {});
    }
  });

  describe("1. Authorization Fallback & Least Privilege Compliance", () => {
    it("Super Admin receives all canonical permissions", async () => {
      const perms = await getUserPermissions(testSuperAdminId);
      expect(perms).toContain(PermissionCode.USER_MANAGE);
      expect(perms).toContain(PermissionCode.ROLE_MANAGE);
      expect(perms).toContain(PermissionCode.SYSTEM_CONFIG_MANAGE);
      expect(perms).toContain(PermissionCode.AUDIT_LOG_VIEW);
      expect(perms).toContain(PermissionCode.SUBJECT_MANAGE);
      expect(perms.size).toBeGreaterThanOrEqual(25);
    });

    it("Ordinary Admin receives canonical admin permissions without Super Admin escalation", async () => {
      const perms = await getUserPermissions(testAdminId);
      // Allowed admin permissions
      expect(perms).toContain(PermissionCode.SUBJECT_MANAGE);
      expect(perms).toContain(PermissionCode.CLASS_MANAGE);
      expect(perms).toContain(PermissionCode.STUDENT_VIEW);
      expect(perms).toContain(PermissionCode.TEACHER_MANAGE);

      // FORBIDDEN Super Admin permissions
      expect(perms).not.toContain(PermissionCode.USER_MANAGE);
      expect(perms).not.toContain(PermissionCode.ROLE_MANAGE);
      expect(perms).not.toContain(PermissionCode.SYSTEM_CONFIG_MANAGE);
      expect(perms).not.toContain(PermissionCode.AUDIT_LOG_VIEW);
      expect(perms).not.toContain(PermissionCode.ADMISSION_APPLICATION_APPROVE);

      // FORBIDDEN financial mutation permissions
      expect(perms).not.toContain(PermissionCode.FINANCE_PAYMENT_RECONCILE);
      expect(perms).not.toContain(PermissionCode.FINANCE_EXPENSE_MANAGE);
    });

    it("Teacher receives strictly teacher-scoped permissions", async () => {
      const perms = await getUserPermissions(testTeacherId);
      expect(perms).toContain(PermissionCode.ASSESSMENT_ENTER);
      expect(perms).toContain(PermissionCode.ATTENDANCE_RECORD);
      expect(perms).toContain(PermissionCode.REPORT_GENERATE);

      // Teachers must never have administrative permissions
      expect(perms).not.toContain(PermissionCode.SUBJECT_MANAGE);
      expect(perms).not.toContain(PermissionCode.CLASS_MANAGE);
      expect(perms).not.toContain(PermissionCode.USER_MANAGE);
    });

    it("Parent receives strictly parent-scoped permissions", async () => {
      const perms = await getUserPermissions(testParentId);
      expect(perms).toContain(PermissionCode.PARENT_CHILD_VIEW);
      expect(perms).toContain(PermissionCode.PARENT_ATTENDANCE_VIEW);
      expect(perms).toContain(PermissionCode.PARENT_RESULT_VIEW);

      // Parents must never have grading or administrative permissions
      expect(perms).not.toContain(PermissionCode.ASSESSMENT_ENTER);
      expect(perms).not.toContain(PermissionCode.SUBJECT_MANAGE);
    });
  });

  describe("2. Administrator-Only Assessment Creation (Issue D)", () => {
    it("Admin with SUBJECT_MANAGE successfully creates an assessment via POST /api/admin/assessments", async () => {
      const payload = {
        title: `P2 Admin Assessment ${Date.now()}`,
        type: "CONTINUOUS_ASSESSMENT",
        programmeId: testProgrammeId,
        schoolClassId: testClassId,
        subjectId: testSubjectId,
        maxScore: 40,
        weightPercentage: 40,
      };

      const req = new NextRequest("http://localhost:3000/api/admin/assessments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(payload),
      });

      const res = await adminAssessmentsPost(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data).toBeDefined();
      expect(data.title).toBe(payload.title);

      // Clean up created assessment
      await prisma.assessment.delete({ where: { id: data.id } });
    });

    it("Teacher attempting to create assessment via POST /api/admin/assessments is blocked with 403 Forbidden", async () => {
      const payload = {
        title: "Unauthorized Teacher Assessment",
        type: "CONTINUOUS_ASSESSMENT",
        programmeId: testProgrammeId,
        schoolClassId: testClassId,
        subjectId: testSubjectId,
        maxScore: 30,
        weightPercentage: 30,
      };

      const req = new NextRequest("http://localhost:3000/api/admin/assessments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${teacherToken}`,
        },
        body: JSON.stringify(payload),
      });

      const res = await adminAssessmentsPost(req);
      expect(res.status).toBe(403);
    });

    it("Teacher attempting POST /api/teacher/assessments is rejected with 403 Forbidden", async () => {
      const req = new NextRequest("http://localhost:3000/api/teacher/assessments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${teacherToken}`,
        },
        body: JSON.stringify({ title: "Old Teacher Assessment Endpoint" }),
      });

      const res = await teacherAssessmentsPost(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain("created and scheduled by school administrators");
    });

    it("Unauthenticated request to POST /api/admin/assessments is rejected with 401 Unauthorized", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/assessments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Anon Assessment" }),
      });

      const res = await adminAssessmentsPost(req);
      expect(res.status).toBe(401);
    });
  });

  describe("3. Role Reconciliation Plan Verification & Safety Gates", () => {
    it("Verifies reconciliation targets strictly contain the 17 production accounts", () => {
      expect(RECONCILIATION_TARGETS.length).toBe(17);
    });

    it("Verifies Account #2 (muhdkanti@gmail.com) is explicitly marked for manual review and not guessed", () => {
      const account2 = RECONCILIATION_TARGETS.find(
        (t) => t.userId === "8f78d46d-13fd-4e23-a9d9-e807984df4e2"
      );
      expect(account2).toBeDefined();
      expect(account2?.requiresManualReview).toBe(true);
      expect(account2?.targetRoles).toEqual([]);
      expect(account2?.evidenceType).toBe("AMBIGUOUS");
    });

    it("Verifies root Super Admin account is defined with SUPER_ADMIN and ADMIN", () => {
      const rootAdmin = RECONCILIATION_TARGETS.find(
        (t) => t.userId === "2f06fdcd-23e5-4e02-8490-3fcf133c609c"
      );
      expect(rootAdmin).toBeDefined();
      expect(rootAdmin?.targetRoles).toContain(RoleCode.SUPER_ADMIN);
      expect(rootAdmin?.targetRoles).toContain(RoleCode.ADMIN);
    });

    it("Verifies all remaining 15 accounts have non-profile evidence sources (Audit logs or Notifications)", () => {
      const accounts = RECONCILIATION_TARGETS.filter(
        (t) => t.userId !== "2f06fdcd-23e5-4e02-8490-3fcf133c609c" && t.userId !== "8f78d46d-13fd-4e23-a9d9-e807984df4e2"
      );
      expect(accounts.length).toBe(15);
      for (const acc of accounts) {
        expect(["AUDIT_LOG", "OUTBOX_NOTIFICATION"]).toContain(acc.evidenceType);
        expect(acc.targetRoles.length).toBeGreaterThan(0);
      }
    });
  });
});
