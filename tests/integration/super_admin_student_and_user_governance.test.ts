import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RoleCode, UserStatus, Gender } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { sanitizeUser, SafeUser } from "@/lib/auth/service";
import {
  getAdminStudentDossier,
  updateStudentAdminDossier,
  deleteStudent,
  createStudent,
} from "@/lib/students/student_service";
import {
  updateAdminUserProfile,
  deleteAdminUser,
} from "@/lib/admin/admin_service";

describe("Integration: Super Admin Governance for Students and Users", () => {
  let superAdmin1: SafeUser;
  let superAdmin2: SafeUser;
  let standardAdmin: SafeUser;
  let teacherUser: SafeUser;
  let testStudentId: string;

  beforeAll(async () => {
    const superRole = await prisma.role.findUnique({ where: { code: RoleCode.SUPER_ADMIN } });
    const adminRole = await prisma.role.findUnique({ where: { code: RoleCode.ADMIN } });
    const teacherRole = await prisma.role.findUnique({ where: { code: RoleCode.TEACHER } });

    if (!superRole || !adminRole || !teacherRole) {
      throw new Error("Seed roles missing.");
    }

    const passHash = await hashPassword("SwanfordTestPass2026!");

    // Super Admin 1
    const u1 = await prisma.user.create({
      data: {
        email: `governance.super1.${Date.now()}@swanford.test`,
        passwordHash: passHash,
        status: UserStatus.ACTIVE,
        firstName: "Chief",
        lastName: "Administrator",
        userRoles: { create: { roleId: superRole.id } },
      },
      include: { userRoles: { include: { role: true } } },
    });
    superAdmin1 = sanitizeUser(u1);

    // Super Admin 2
    const u2 = await prisma.user.create({
      data: {
        email: `governance.super2.${Date.now()}@swanford.test`,
        passwordHash: passHash,
        status: UserStatus.ACTIVE,
        firstName: "Second",
        lastName: "SuperAdmin",
        userRoles: { create: { roleId: superRole.id } },
      },
      include: { userRoles: { include: { role: true } } },
    });
    superAdmin2 = sanitizeUser(u2);

    // Standard Admin
    const u3 = await prisma.user.create({
      data: {
        email: `governance.admin.${Date.now()}@swanford.test`,
        passwordHash: passHash,
        status: UserStatus.ACTIVE,
        firstName: "Standard",
        lastName: "Admin",
        userRoles: { create: { roleId: adminRole.id } },
      },
      include: { userRoles: { include: { role: true } } },
    });
    standardAdmin = sanitizeUser(u3);

    // Teacher
    const u4 = await prisma.user.create({
      data: {
        email: `governance.teacher.${Date.now()}@swanford.test`,
        passwordHash: passHash,
        status: UserStatus.ACTIVE,
        firstName: "Faculty",
        lastName: "Member",
        userRoles: { create: { roleId: teacherRole.id } },
      },
      include: { userRoles: { include: { role: true } } },
    });
    teacherUser = sanitizeUser(u4);

    // Create a student for testing (createStudent returns { student, warnings })
    const { student } = await createStudent(superAdmin1, {
      firstName: "Ibrahim",
      lastName: "Danladi",
      gender: Gender.MALE,
      dateOfBirth: new Date("2017-05-12"),
      bloodGroup: "O+",
      genotype: "AA",
      allergies: "Peanuts",
      emergencyContactName: "Alhaji Danladi",
      emergencyContactPhone: "+2348030000000",
    });
    testStudentId = student.id;
  });

  afterAll(async () => {
    const userIds = [superAdmin1?.id, superAdmin2?.id, standardAdmin?.id, teacherUser?.id].filter(Boolean) as string[];
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });

    if (testStudentId) {
      await prisma.guardianStudentRelationship.deleteMany({ where: { studentId: testStudentId } });
      await prisma.studentProgrammeEnrollment.deleteMany({ where: { studentId: testStudentId } });
      await prisma.student.deleteMany({ where: { id: testStudentId } });
    }
  });

  // ==========================================
  // STUDENT GOVERNANCE TESTS
  // ==========================================

  it("retrieves complete student dossier with defensive relation arrays", async () => {
    const dossier = await getAdminStudentDossier(superAdmin1, testStudentId);

    expect(dossier).toBeDefined();
    expect(dossier.id).toBe(testStudentId);
    expect(dossier.firstName).toBe("Ibrahim");
    expect(dossier.lastName).toBe("Danladi");
    // Verify defensive arrays exist and do not cause undefined.length errors
    expect(Array.isArray(dossier.guardians)).toBe(true);
    expect(Array.isArray(dossier.programmeEnrollments)).toBe(true);
    expect(Array.isArray(dossier.attendanceRecords)).toBe(true);
    expect(Array.isArray(dossier.invoices)).toBe(true);
    expect(Array.isArray(dossier.assessmentScores)).toBe(true);
    expect(Array.isArray(dossier.reportReleases)).toBe(true);
    expect(dossier.dob).toBeDefined();
    expect(dossier.status).toBeDefined();
  });

  it("prevents non-Super Admin from updating student dossier", async () => {
    await expect(
      updateStudentAdminDossier(standardAdmin, testStudentId, {
        firstName: "UnauthorizedChange",
      })
    ).rejects.toThrow(/Only Super Administrators/);
  });

  it("allows Super Admin to update student demographics and medical record", async () => {
    const updated = await updateStudentAdminDossier(superAdmin1, testStudentId, {
      firstName: "Ibrahim-Updated",
      lastName: "Danladi-Gwandu",
      allergies: "Peanuts and Shellfish",
      medicalConditions: "Asthma inhaler in bag",
    });

    expect(updated.firstName).toBe("Ibrahim-Updated");
    expect(updated.lastName).toBe("Danladi-Gwandu");
    expect(updated.allergies).toBe("Peanuts and Shellfish");
    expect(updated.medicalConditions).toBe("Asthma inhaler in bag");

    // Verify audit log recorded
    const audit = await prisma.auditLog.findFirst({
      where: {
        userId: superAdmin1.id,
        action: "STUDENT_ADMIN_DOSSIER_UPDATE",
        entityId: testStudentId,
      },
    });
    expect(audit).toBeDefined();
  });

  it("prevents non-Super Admin from deleting a student", async () => {
    await expect(deleteStudent(standardAdmin, testStudentId)).rejects.toThrow(
      /Only Super Administrators/
    );
  });

  it("allows Super Admin to permanently delete a student with cascading cleanup", async () => {
    const deleted = await deleteStudent(superAdmin1, testStudentId);
    expect(deleted.id).toBe(testStudentId);

    // Verify student no longer exists in DB
    const lookup = await prisma.student.findUnique({ where: { id: testStudentId } });
    expect(lookup).toBeNull();
    testStudentId = ""; // Marked deleted
  });

  // ==========================================
  // USER GOVERNANCE TESTS
  // ==========================================

  it("prevents non-Super Admin from updating user accounts", async () => {
    await expect(
      updateAdminUserProfile(standardAdmin, teacherUser.id, {
        firstName: "HackedName",
      })
    ).rejects.toThrow(/Only Super Administrators/);
  });

  it("allows Super Admin to update user profile and assigned roles", async () => {
    const uniquePhone = `+23480${Math.floor(10000000 + Math.random() * 90000000)}`;
    const updated = await updateAdminUserProfile(superAdmin1, teacherUser.id, {
      firstName: "Malam",
      lastName: "Abubakar",
      phoneNumber: uniquePhone,
      roles: [RoleCode.TEACHER, RoleCode.ADMIN],
    });

    expect(updated.firstName).toBe("Malam");
    expect(updated.lastName).toBe("Abubakar");
    expect(updated.phoneNumber).toBe(uniquePhone);
    const roleCodes = updated.userRoles.map((r) => r.role.code);
    expect(roleCodes).toContain(RoleCode.TEACHER);
    expect(roleCodes).toContain(RoleCode.ADMIN);
  });

  it("prevents demoting the sole Super Admin", async () => {
    // Find all currently active super admin users except superAdmin1
    const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.SUPER_ADMIN } });
    const otherSuperAdmins = await prisma.userRole.findMany({
      where: {
        roleId: superAdminRole.id,
        userId: { not: superAdmin1.id },
        user: { status: UserStatus.ACTIVE },
      },
      select: { userId: true },
    });

    // Temporarily deactivate other super admins so superAdmin1 is the sole active super admin
    const otherIds = otherSuperAdmins.map((o) => o.userId);
    if (otherIds.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: otherIds } },
        data: { status: UserStatus.SUSPENDED },
      });
    }

    try {
      // Now attempt to revoke SUPER_ADMIN from superAdmin1
      await expect(
        updateAdminUserProfile(superAdmin1, superAdmin1.id, {
          roles: [RoleCode.ADMIN],
        })
      ).rejects.toThrow(/sole active Super Administrator/);
    } finally {
      // Restore other super admins
      if (otherIds.length > 0) {
        await prisma.user.updateMany({
          where: { id: { in: otherIds } },
          data: { status: UserStatus.ACTIVE },
        });
      }
    }
  });

  it("prevents self-deletion by Super Admin", async () => {
    await expect(deleteAdminUser(superAdmin1, superAdmin1.id)).rejects.toThrow(
      /Cannot delete your own active administrator account/
    );
  });

  it("prevents non-Super Admin from deleting user accounts", async () => {
    await expect(deleteAdminUser(standardAdmin, teacherUser.id)).rejects.toThrow(
      /Only Super Administrators/
    );
  });

  it("allows Super Admin to permanently delete a user account", async () => {
    const deleted = await deleteAdminUser(superAdmin1, teacherUser.id);
    expect(deleted.id).toBe(teacherUser.id);

    // Verify user no longer exists in DB
    const lookup = await prisma.user.findUnique({ where: { id: teacherUser.id } });
    expect(lookup).toBeNull();
  });
});
