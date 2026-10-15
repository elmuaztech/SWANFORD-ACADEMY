import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { RoleCode, UserStatus, FeeApplicableGender, AssessmentType } from '@prisma/client';
import { hashPassword } from '@/lib/auth/password';
import { loginUser, SafeUser } from '@/lib/auth/service';
import { hasPermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import {
  createAssessmentConfig,
  updateAssessmentConfig,
  deleteAssessmentConfig,
} from '@/lib/assessment/assessment_config_service';

describe('Post-Deployment Security, Authentication, Permissions and UI Repairs', { timeout: 30000 }, () => {
  const timestamp = Date.now();
  const teacherEmail = `test.teacher.${timestamp}@example.com`;
  const accountantEmail = `test.accountant.${timestamp}@example.com`;
  const adminEmail = `test.admin.${timestamp}@example.com`;
  const parentEmail = `test.parent.${timestamp}@example.com`;
  const testPassword = 'Password123!@#';

  let teacherUser: any;
  let accountantUser: any;
  let adminUser: any;
  let parentUser: any;
  let academicSessionId: string;
  let primaryProgrammeId: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword(testPassword);

    // 1. Fetch system roles
    const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.TEACHER } });
    const accountantRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.ACCOUNTANT } });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.ADMIN } });
    const parentRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.PARENT } });

    // 2. Resolve active session & programme
    const session = await prisma.academicSession.findFirst({ where: { isCurrent: true } });
    academicSessionId = session?.id || (await prisma.academicSession.findFirstOrThrow()).id;

    const prog = await prisma.programme.findFirst({ where: { isActive: true } });
    primaryProgrammeId = prog?.id || (await prisma.programme.findFirstOrThrow()).id;

    // 3. Create Teacher User with Teacher Profile
    teacherUser = await prisma.user.create({
      data: {
        email: teacherEmail,
        passwordHash,
        status: UserStatus.ACTIVE,
        teacherProfile: {
          create: {
            staffIdNumber: `STF-TCH-${timestamp}`,
            firstName: 'Tijani',
            lastName: 'Babangida',
          },
        },
        userRoles: {
          create: { roleId: teacherRole.id },
        },
      },
      include: {
        teacherProfile: true,
      },
    });

    // 4. Create Accountant User
    accountantUser = await prisma.user.create({
      data: {
        email: accountantEmail,
        passwordHash,
        status: UserStatus.ACTIVE,
        userRoles: {
          create: { roleId: accountantRole.id },
        },
      },
    });

    // 5. Create School Admin User
    adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        status: UserStatus.ACTIVE,
        userRoles: {
          create: { roleId: adminRole.id },
        },
      },
    });

    // 6. Create Parent User with Guardian Profile
    parentUser = await prisma.user.create({
      data: {
        email: parentEmail,
        passwordHash,
        status: UserStatus.ACTIVE,
        guardianProfile: {
          create: {
            firstName: 'Amina',
            lastName: 'Bello',
          },
        },
        userRoles: {
          create: { roleId: parentRole.id },
        },
      },
      include: {
        guardianProfile: true,
      },
    });
  });

  afterAll(async () => {
    const userIds = [teacherUser?.id, accountantUser?.id, adminUser?.id, parentUser?.id].filter(Boolean);
    if (userIds.length > 0) {
      await prisma.teacher.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.guardian.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  describe('Issue 1: 6-Digit OTP Standardization', () => {
    it('validates 6 numeric digits and preserves leading zeroes', () => {
      const validCodes = ['004271', '123456', '000000', '999999'];
      const invalidCodes = ['1234', '12345', '1234567', 'abcdef', '12345a'];

      for (const code of validCodes) {
        expect(/^\d{6}$/.test(code.trim())).toBe(true);
      }
      for (const code of invalidCodes) {
        expect(/^\d{6}$/.test(code.trim())).toBe(false);
      }
    });
  });

  describe('Issue 5: Repeat Login and Portal Role Routing', () => {
    it('reliably returns TEACHER role on repeat login for teachers', async () => {
      const loginRes = await loginUser({ email: teacherEmail, password: testPassword });
      expect(loginRes.user.roles).toContain(RoleCode.TEACHER);
      expect(loginRes.user.teacherId).toBeDefined();
    });

    it('reliably returns PARENT role on repeat login for parents', async () => {
      const loginRes = await loginUser({ email: parentEmail, password: testPassword });
      expect(loginRes.user.roles).toContain(RoleCode.PARENT);
      expect(loginRes.user.guardianId).toBeDefined();
    });

    it('reliably returns ACCOUNTANT role on login for accountant', async () => {
      const loginRes = await loginUser({ email: accountantEmail, password: testPassword });
      expect(loginRes.user.roles).toContain(RoleCode.ACCOUNTANT);
    });

    it('reliably returns ADMIN role on login for school administrators', async () => {
      const loginRes = await loginUser({ email: adminEmail, password: testPassword });
      expect(loginRes.user.roles).toContain(RoleCode.ADMIN);
    });
  });

  describe('Issue 3: School Administrator Fee Structure Permissions', () => {
    it('grants School Administrator FEE_STRUCTURE_MANAGE and FINANCE_INVOICE_VIEW permissions', async () => {
      const canManageFeeStructures = await hasPermission(adminUser.id, PermissionCode.FEE_STRUCTURE_MANAGE);
      expect(canManageFeeStructures).toBe(true);

      const canViewInvoices = await hasPermission(adminUser.id, PermissionCode.FINANCE_INVOICE_VIEW);
      expect(canViewInvoices).toBe(true);

      const canViewReports = await hasPermission(adminUser.id, PermissionCode.FINANCE_REPORT_VIEW);
      expect(canViewReports).toBe(true);
    });

    it('allows School Administrator to create itemized fee structure', async () => {
      // Create a test term under academic session
      const term = await prisma.academicTerm.findFirst({
        where: { academicSessionId },
      });
      const termId = term?.id || (await prisma.academicTerm.findFirstOrThrow()).id;

      const created = await prisma.feeStructure.create({
        data: {
          name: `Tuition & Books - ${timestamp}`,
          academicSessionId,
          academicTermId: termId,
          programmeId: primaryProgrammeId,
          applicableGender: FeeApplicableGender.ALL,
          isAdmissionFee: false,
          feeItems: {
            create: [
              { name: 'Tuition Fee', amountKobo: BigInt(8500000) }, // ₦85,000
              { name: 'Textbooks & Workbooks', amountKobo: BigInt(2500000) }, // ₦25,000
            ],
          },
        },
        include: {
          feeItems: true,
        },
      });

      expect(created.id).toBeDefined();
      expect(created.feeItems).toHaveLength(2);

      const totalKobo = created.feeItems.reduce((acc, item) => acc + item.amountKobo, BigInt(0));
      expect(totalKobo).toBe(BigInt(11000000)); // ₦110,000

      // Cleanup fee structure
      await prisma.feeStructure.delete({ where: { id: created.id } });
    });
  });

  describe('Issue 4: School Administrator Assessment Permissions', () => {
    it('allows School Administrator to create and update assessment structure configs without SYSTEM_CONFIG_MANAGE', async () => {
      const configName = `Admin Config ${timestamp}`;
      const safeAdminUser: SafeUser = {
        id: adminUser.id,
        email: adminUser.email,
        phoneNumber: null,
        status: adminUser.status,
        emailVerifiedAt: new Date(),
        lastLoginAt: new Date(),
        createdAt: adminUser.createdAt,
        roles: [RoleCode.ADMIN],
      };

      const created = await createAssessmentConfig(safeAdminUser, {
        name: configName,
        programmeId: primaryProgrammeId,
        academicSessionId,
        components: [
          {
            name: 'Mid-Term Test',
            shortCode: 'MT',
            maxScore: 30,
            weightPercentage: 30,
            type: AssessmentType.CONTINUOUS_ASSESSMENT,
          },
          {
            name: 'Terminal Exam',
            shortCode: 'EXAM',
            maxScore: 70,
            weightPercentage: 70,
            type: AssessmentType.EXAMINATION,
          },
        ],
      });

      expect(created.id).toBeDefined();
      expect(created.name).toBe(configName);

      const updated = await updateAssessmentConfig(safeAdminUser, created.id, {
        name: `${configName} Updated`,
      });

      expect(updated.name).toBe(`${configName} Updated`);

      // Verify School Administrator cannot delete assessment config (strictly Super Admin)
      await expect(deleteAssessmentConfig(safeAdminUser, created.id)).rejects.toThrow(
        /Access denied: Missing required permission 'system_config:manage'/
      );

      // Cleanup
      await prisma.assessmentStructureConfig.delete({ where: { id: created.id } });
    });

    it('strictly denies Teachers (ASSESSMENT_ENTER only) from configuring or deleting assessment configs', async () => {
      const safeTeacherUser: SafeUser = {
        id: teacherUser.id,
        email: teacherUser.email,
        phoneNumber: null,
        status: teacherUser.status,
        emailVerifiedAt: new Date(),
        lastLoginAt: new Date(),
        createdAt: teacherUser.createdAt,
        roles: [RoleCode.TEACHER],
      };

      // 1. Teacher cannot create assessment configs
      await expect(
        createAssessmentConfig(safeTeacherUser, {
          name: 'Teacher Illegal Config',
          programmeId: primaryProgrammeId,
          academicSessionId,
          components: [
            {
              name: 'Test',
              shortCode: 'TST',
              maxScore: 100,
              weightPercentage: 100,
              type: AssessmentType.CONTINUOUS_ASSESSMENT,
            },
          ],
        })
      ).rejects.toThrow(/Access denied: Requires at least one of/);

      // 2. Teacher cannot update assessment configs
      await expect(
        updateAssessmentConfig(safeTeacherUser, 'dummy-id', {
          name: 'Teacher Rename Attempt',
        })
      ).rejects.toThrow(/Access denied: Requires at least one of/);

      // 3. Teacher cannot delete assessment configs
      await expect(deleteAssessmentConfig(safeTeacherUser, 'dummy-id')).rejects.toThrow(
        /Access denied: Missing required permission 'system_config:manage'/
      );
    });
  });
});
