import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  RoleCode,
  Gender,
  UserStatus,
  ApplicationStatus,
  ApplicationPaymentStatus,
  ProgrammeSelectionStatus,
} from '@prisma/client';
import { reviewProgrammeSelection } from '@/lib/admissions/application_service';
import { matriculateApplication } from '@/lib/admissions/matriculation_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { SafeUser } from '@/lib/auth/service';

describe('Strict Super Admin Admission Approval & Portal Provisioning Invariant', () => {
  let superAdminActor: SafeUser;
  let adminOnlyActor: SafeUser;
  let testAdmissionCycleId: string;
  let testProgrammeId: string;
  let testAcademicSessionId: string;
  let testSchoolClassId: string;

  beforeEach(async () => {
    // 1. Resolve canonical academic session & term
    const session = await prisma.academicSession.findFirst({
      where: { name: '2026/2027' },
      include: { terms: true },
    });
    if (!session) throw new Error('Canonical session 2026/2027 required for test');
    testAcademicSessionId = session.id;

    // 2. Resolve primary programme and class
    const programme = await prisma.programme.findFirst({
      where: { isMainAcademic: true },
    });
    if (!programme) throw new Error('Main academic programme required for test');
    testProgrammeId = programme.id;

    const schoolClass = await prisma.schoolClass.findFirst({
      where: { programmeId: testProgrammeId },
    });
    if (!schoolClass) throw new Error('School class required for test');
    testSchoolClassId = schoolClass.id;

    // 3. Resolve or create admission cycle
    let cycle = await prisma.admissionCycle.findFirst({
      where: { academicSessionId: testAcademicSessionId },
    });
    if (!cycle) {
      cycle = await prisma.admissionCycle.create({
        data: {
          code: `TEST-CYCLE-${Date.now()}`,
          name: 'Test Admission Cycle',
          academicSessionId: testAcademicSessionId,
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      await prisma.admissionCycleProgramme.create({
        data: {
          admissionCycleId: cycle.id,
          programmeId: testProgrammeId,
          maxCapacity: 50,
        },
      });
    }
    testAdmissionCycleId = cycle.id;

    // 4. Resolve Roles
    const superAdminRole = await prisma.role.findUnique({ where: { code: RoleCode.SUPER_ADMIN } });
    const adminRole = await prisma.role.findUnique({ where: { code: RoleCode.ADMIN } });
    if (!superAdminRole || !adminRole) throw new Error('System roles not seeded');

    // 5. Create dedicated SUPER_ADMIN user in DB
    const superUser = await prisma.user.upsert({
      where: { email: 'test_superadmin@swanford.internal' },
      update: { status: UserStatus.ACTIVE },
      create: {
        email: 'test_superadmin@swanford.internal',
        status: UserStatus.ACTIVE,
        passwordHash: 'test_password_hash',
        emailVerifiedAt: new Date(),
      },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: superUser.id, roleId: superAdminRole.id } },
      update: {},
      create: { userId: superUser.id, roleId: superAdminRole.id },
    });

    superAdminActor = {
      id: superUser.id,
      email: superUser.email,
      phoneNumber: superUser.phoneNumber,
      status: superUser.status,
      roles: [RoleCode.SUPER_ADMIN, RoleCode.ADMIN],
      emailVerifiedAt: superUser.emailVerifiedAt,
      lastLoginAt: new Date(),
      createdAt: superUser.createdAt,
    };

    // 6. Create dedicated ADMIN-ONLY user in DB (strictly lacks SUPER_ADMIN)
    const adminUser = await prisma.user.upsert({
      where: { email: 'test_admin_only@swanford.internal' },
      update: { status: UserStatus.ACTIVE },
      create: {
        email: 'test_admin_only@swanford.internal',
        status: UserStatus.ACTIVE,
        passwordHash: 'test_password_hash',
        emailVerifiedAt: new Date(),
      },
    });

    await prisma.userRole.deleteMany({
      where: { userId: adminUser.id, roleId: superAdminRole.id },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
      update: {},
      create: { userId: adminUser.id, roleId: adminRole.id },
    });

    adminOnlyActor = {
      id: adminUser.id,
      email: adminUser.email,
      phoneNumber: adminUser.phoneNumber,
      status: adminUser.status,
      roles: [RoleCode.ADMIN],
      emailVerifiedAt: adminUser.emailVerifiedAt,
      lastLoginAt: new Date(),
      createdAt: adminUser.createdAt,
    };
  });

  it('rejects general ADMIN-only user from approving an admission (throws HTTP 403 SUPER_ADMIN_REQUIRED)', async () => {
    // Create an application with a programme selection
    const app = await prisma.application.create({
      data: {
        applicationNumber: `APP-TEST-${Date.now()}-1`,
        admissionCycleId: testAdmissionCycleId,
        academicSessionId: testAcademicSessionId,
        applicantFirstName: 'Zainab',
        applicantLastName: 'Bello',
        applicantGender: Gender.FEMALE,
        applicantDob: new Date('2018-05-12'),
        guardianFirstName: 'Fatima',
        guardianLastName: 'Bello',
        guardianEmail: `fatima.bello.${Date.now()}@example.com`,
        guardianPhone: '+2348039991122',
        guardianRelationship: 'MOTHER',
        status: ApplicationStatus.SUBMITTED,
        paymentStatus: ApplicationPaymentStatus.PAYMENT_CONFIRMED,
        totalAmountKobo: BigInt(500000),
        amountPaidKobo: BigInt(500000),
        programmeSelections: {
          create: [
            {
              programmeId: testProgrammeId,
              targetClassId: testSchoolClassId,
              status: ProgrammeSelectionStatus.PENDING,
            },
          ],
        },
      },
      include: { programmeSelections: true },
    });

    const selectionId = app.programmeSelections[0].id;

    // ADMIN-only actor attempts approval
    await expect(
      reviewProgrammeSelection(adminOnlyActor, selectionId, {
        decision: 'APPROVED',
        decisionNotes: 'Attempted approval by general school administrator',
      })
    ).rejects.toThrow(AuthorizationError);

    try {
      await reviewProgrammeSelection(adminOnlyActor, selectionId, {
        decision: 'APPROVED',
      });
    } catch (err) {
      const authErr = err as AuthorizationError;
      expect(authErr.statusCode).toBe(403);
      expect(['PERMISSION_DENIED', 'SUPER_ADMIN_REQUIRED']).toContain(authErr.code);
    }

    // Verify application status remained SUBMITTED (not approved)
    const freshApp = await prisma.application.findUnique({ where: { id: app.id } });
    expect(freshApp?.status).toBe(ApplicationStatus.SUBMITTED);

    // Verify NO parent portal user account was created
    const createdUser = await prisma.user.findUnique({
      where: { email: app.guardianEmail },
    });
    expect(createdUser).toBeNull();
  });

  it('rejects general ADMIN-only user from matriculating an application (throws HTTP 403 SUPER_ADMIN_REQUIRED)', async () => {
    // Create an approved application
    const app = await prisma.application.create({
      data: {
        applicationNumber: `APP-TEST-${Date.now()}-2`,
        admissionCycleId: testAdmissionCycleId,
        academicSessionId: testAcademicSessionId,
        applicantFirstName: 'Ibrahim',
        applicantLastName: 'Bello',
        applicantGender: Gender.MALE,
        applicantDob: new Date('2017-03-20'),
        guardianFirstName: 'Mustapha',
        guardianLastName: 'Bello',
        guardianEmail: `mustapha.bello.${Date.now()}@example.com`,
        guardianPhone: '+2348039992233',
        guardianRelationship: 'FATHER',
        status: ApplicationStatus.APPROVED,
        paymentStatus: ApplicationPaymentStatus.PAYMENT_CONFIRMED,
        totalAmountKobo: BigInt(500000),
        amountPaidKobo: BigInt(500000),
        programmeSelections: {
          create: [
            {
              programmeId: testProgrammeId,
              targetClassId: testSchoolClassId,
              status: ProgrammeSelectionStatus.APPROVED,
            },
          ],
        },
      },
    });

    // ADMIN-only actor attempts matriculation
    await expect(
      matriculateApplication(adminOnlyActor, {
        applicationId: app.id,
      })
    ).rejects.toThrow(AuthorizationError);

    try {
      await matriculateApplication(adminOnlyActor, {
        applicationId: app.id,
      });
    } catch (err) {
      const authErr = err as AuthorizationError;
      expect(authErr.statusCode).toBe(403);
      expect(['PERMISSION_DENIED', 'SUPER_ADMIN_REQUIRED']).toContain(authErr.code);
    }

    // Verify application was not matriculated
    const freshApp = await prisma.application.findUnique({ where: { id: app.id } });
    expect(freshApp?.status).toBe(ApplicationStatus.APPROVED);
    expect(freshApp?.admittedStudentId).toBeNull();
  });

  it('allows verified SUPER_ADMIN user to approve admission and provision parent portal account', async () => {
    const guardianEmail = `superadmin.approved.${Date.now()}@example.com`;
    const app = await prisma.application.create({
      data: {
        applicationNumber: `APP-TEST-${Date.now()}-3`,
        admissionCycleId: testAdmissionCycleId,
        academicSessionId: testAcademicSessionId,
        applicantFirstName: 'Amina',
        applicantLastName: 'Danjuma',
        applicantGender: Gender.FEMALE,
        applicantDob: new Date('2019-01-15'),
        guardianFirstName: 'Danjuma',
        guardianLastName: 'Aliyu',
        guardianEmail,
        guardianPhone: '+2348039993344',
        guardianRelationship: 'FATHER',
        status: ApplicationStatus.UNDER_REVIEW,
        paymentStatus: ApplicationPaymentStatus.PAYMENT_CONFIRMED,
        totalAmountKobo: BigInt(500000),
        amountPaidKobo: BigInt(500000),
        programmeSelections: {
          create: [
            {
              programmeId: testProgrammeId,
              targetClassId: testSchoolClassId,
              status: ProgrammeSelectionStatus.PENDING,
            },
          ],
        },
      },
      include: { programmeSelections: true },
    });

    const selectionId = app.programmeSelections[0].id;

    // SUPER_ADMIN actor approves
    const result = await reviewProgrammeSelection(superAdminActor, selectionId, {
      decision: 'APPROVED',
      decisionNotes: 'Officially accepted by Super Administrator',
    });

    expect(result.selection.status).toBe(ProgrammeSelectionStatus.APPROVED);
    expect(result.applicationStatus).toBe(ApplicationStatus.APPROVED);

    // Verify parent portal account was created with PENDING_VERIFICATION status
    const createdUser = await prisma.user.findUnique({
      where: { email: guardianEmail },
      include: { userRoles: { include: { role: true } }, emailVerifications: true },
    });

    expect(createdUser).not.toBeNull();
    expect(createdUser?.status).toBe(UserStatus.PENDING_VERIFICATION);
    expect(createdUser?.userRoles.some((r) => r.role.code === RoleCode.PARENT)).toBe(true);
    expect(createdUser?.emailVerifications.length).toBeGreaterThan(0);
  });

  it('guarantees that REJECTED, WITHDRAWN, or PENDING applications never trigger portal account creation', async () => {
    const guardianEmail = `rejected.applicant.${Date.now()}@example.com`;
    const app = await prisma.application.create({
      data: {
        applicationNumber: `APP-TEST-${Date.now()}-4`,
        admissionCycleId: testAdmissionCycleId,
        academicSessionId: testAcademicSessionId,
        applicantFirstName: 'Usman',
        applicantLastName: 'Kabir',
        applicantGender: Gender.MALE,
        applicantDob: new Date('2018-09-10'),
        guardianFirstName: 'Kabir',
        guardianLastName: 'Usman',
        guardianEmail,
        guardianPhone: '+2348039994455',
        guardianRelationship: 'FATHER',
        status: ApplicationStatus.UNDER_REVIEW,
        paymentStatus: ApplicationPaymentStatus.PAYMENT_CONFIRMED,
        totalAmountKobo: BigInt(500000),
        amountPaidKobo: BigInt(500000),
        programmeSelections: {
          create: [
            {
              programmeId: testProgrammeId,
              targetClassId: testSchoolClassId,
              status: ProgrammeSelectionStatus.PENDING,
            },
          ],
        },
      },
      include: { programmeSelections: true },
    });

    const selectionId = app.programmeSelections[0].id;

    // Reject application
    const result = await reviewProgrammeSelection(superAdminActor, selectionId, {
      decision: 'REJECTED',
      decisionNotes: 'Application criteria not met',
    });

    expect(result.applicationStatus).toBe(ApplicationStatus.REJECTED);

    // Verify NO user account was provisioned for rejected applicant
    const userCheck = await prisma.user.findUnique({
      where: { email: guardianEmail },
    });
    expect(userCheck).toBeNull();
  });
});
