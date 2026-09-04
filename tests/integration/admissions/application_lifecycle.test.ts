import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  AdmissionCycleStatus,
  ApplicationPaymentStatus,
  ApplicationStatus,
  Gender,
  ProgrammeCode,
  RelationshipType,
  RoleCode,
  TermCode,
} from '@prisma/client';
import {
  createDraftApplication,
  submitApplication,
  confirmApplicationPayment,
  getApplicationById,
} from '@/lib/admissions/application_service';
import { createAdmissionCycle } from '@/lib/admissions/cycle_service';
import { SafeUser } from '@/lib/auth/service';

describe('Stage 7 — Integration: Application Lifecycle, Charges & Trusted Payment', () => {
  let adminUser: SafeUser;
  let academicSessionId: string;
  let cycleId: string;
  let primaryProgId: string;
  let tahfeezProgId: string;

  beforeEach(async () => {
    // 1. Setup Session and First Term
    const session = await prisma.academicSession.create({
      data: {
        name: `App-Life-Session-${Date.now()}`,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-07-31'),
        isCurrent: true,
      },
    });
    academicSessionId = session.id;

    await prisma.academicTerm.create({
      data: {
        academicSessionId: session.id,
        termCode: TermCode.FIRST,
        name: 'First Term',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-12-15'),
        isCurrent: true,
      },
    });

    // 2. Setup Super Admin
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.SUPER_ADMIN } });
    const user = await prisma.user.create({
      data: {
        email: `app-admin-${Date.now()}@example.com`,
        passwordHash: 'dummy-hash',
        status: 'ACTIVE',
      },
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: adminRole.id },
    });

    adminUser = {
      id: user.id,
      email: user.email,
      phoneNumber: null,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      createdAt: new Date(),
    };

    const primaryProg = await prisma.programme.findUniqueOrThrow({
      where: { code: ProgrammeCode.PRIMARY },
    });
    primaryProgId = primaryProg.id;

    const tahfeezProg = await prisma.programme.findUniqueOrThrow({
      where: { code: ProgrammeCode.TAHFEEZ },
    });
    tahfeezProgId = tahfeezProg.id;

    // 3. Create Open Admission Cycle (Valid all year 2026)
    const cycle = await createAdmissionCycle(adminUser, {
      academicSessionId,
      code: `ADM-APP-${Date.now()}`,
      name: 'Application Test Cycle',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      status: AdmissionCycleStatus.OPEN,
    });
    cycleId = cycle.id;
  });

  it('creates draft application with APP-YYYY-NNNN number and snapshotted charge items', async () => {
    const app = await createDraftApplication({
      admissionCycleId: cycleId,
      applicantFirstName: 'Zayd',
      applicantLastName: 'Ali',
      applicantGender: Gender.MALE,
      applicantDob: new Date('2018-05-15'),
      guardianFirstName: 'Usman',
      guardianLastName: 'Ali',
      guardianEmail: `usman.ali-${Date.now()}@example.com`,
      guardianPhone: '+2348011223344',
      guardianRelationship: RelationshipType.FATHER,
      programmeSelections: [
        { programmeId: primaryProgId },
        { programmeId: tahfeezProgId },
      ],
    });

    expect(app.applicationNumber).toMatch(/^APP-\d{4}-\d{4}$/);
    expect(app.status).toBe(ApplicationStatus.DRAFT);
    expect(app.paymentStatus).toBe(ApplicationPaymentStatus.UNPAID);
    expect(app.programmeSelections).toHaveLength(2);
    expect(app.chargeItems.length).toBeGreaterThan(0);

    // Form fee charge item is present
    const formFeeItem = app.chargeItems.find((c) => c.chargeType === 'APPLICATION_FORM_FEE');
    expect(formFeeItem).toBeDefined();
    expect(formFeeItem?.totalAmountKobo).toBe(BigInt(500000));
  });

  it('blocks duplicate active applications for the same child in the same cycle', async () => {
    const guardianEmail = `parent-dup-${Date.now()}@example.com`;
    const dob = new Date('2019-02-10');

    await createDraftApplication({
      admissionCycleId: cycleId,
      applicantFirstName: 'Fatima',
      applicantLastName: 'Ibrahim',
      applicantGender: Gender.FEMALE,
      applicantDob: dob,
      guardianFirstName: 'Ibrahim',
      guardianLastName: 'Suleiman',
      guardianEmail,
      guardianPhone: '+2348033334444',
      guardianRelationship: RelationshipType.FATHER,
      programmeSelections: [{ programmeId: primaryProgId }],
    });

    // Attempting another draft for same child & parent must be blocked
    await expect(
      createDraftApplication({
        admissionCycleId: cycleId,
        applicantFirstName: 'Fatima',
        applicantLastName: 'Ibrahim',
        applicantGender: Gender.FEMALE,
        applicantDob: dob,
        guardianFirstName: 'Ibrahim',
        guardianLastName: 'Suleiman',
        guardianEmail,
        guardianPhone: '+2348033334444',
        guardianRelationship: RelationshipType.FATHER,
        programmeSelections: [{ programmeId: primaryProgId }],
      })
    ).rejects.toThrow('already exists');
  });

  it('allows reapplication if an earlier application was REJECTED', async () => {
    const guardianEmail = `parent-reapply-${Date.now()}@example.com`;
    const dob = new Date('2019-04-12');

    const app1 = await createDraftApplication({
      admissionCycleId: cycleId,
      applicantFirstName: 'Tariq',
      applicantLastName: 'Mansur',
      applicantGender: Gender.MALE,
      applicantDob: dob,
      guardianFirstName: 'Mansur',
      guardianLastName: 'Ahmed',
      guardianEmail,
      guardianPhone: '+2348055556666',
      guardianRelationship: RelationshipType.FATHER,
      programmeSelections: [{ programmeId: primaryProgId }],
    });

    // Mark app1 as REJECTED
    await prisma.application.update({
      where: { id: app1.id },
      data: { status: ApplicationStatus.REJECTED },
    });

    // A fresh application for Tariq Mansur should now be accepted!
    const app2 = await createDraftApplication({
      admissionCycleId: cycleId,
      applicantFirstName: 'Tariq',
      applicantLastName: 'Mansur',
      applicantGender: Gender.MALE,
      applicantDob: dob,
      guardianFirstName: 'Mansur',
      guardianLastName: 'Ahmed',
      guardianEmail,
      guardianPhone: '+2348055556666',
      guardianRelationship: RelationshipType.FATHER,
      programmeSelections: [{ programmeId: primaryProgId }],
    });

    expect(app2).toBeDefined();
    expect(app2.id).not.toBe(app1.id);
  });

  it('submits application advancing status to SUBMITTED and PAYMENT_PENDING', async () => {
    const app = await createDraftApplication({
      admissionCycleId: cycleId,
      applicantFirstName: 'Amina',
      applicantLastName: 'Kano',
      applicantGender: Gender.FEMALE,
      applicantDob: new Date('2018-09-20'),
      guardianFirstName: 'Hadiza',
      guardianLastName: 'Kano',
      guardianEmail: `hadiza.kano-${Date.now()}@example.com`,
      guardianPhone: '+2348077778888',
      guardianRelationship: RelationshipType.MOTHER,
      programmeSelections: [{ programmeId: primaryProgId }],
    });

    const submitted = await submitApplication(app.id);
    expect(submitted.status).toBe(ApplicationStatus.SUBMITTED);
    expect(submitted.paymentStatus).toBe(ApplicationPaymentStatus.PAYMENT_PENDING);
  });

  it('confirms payment through trusted administrative boundary advancing to UNDER_REVIEW', async () => {
    const app = await createDraftApplication({
      admissionCycleId: cycleId,
      applicantFirstName: 'Bilal',
      applicantLastName: 'Danladi',
      applicantGender: Gender.MALE,
      applicantDob: new Date('2017-11-11'),
      guardianFirstName: 'Danladi',
      guardianLastName: 'Bello',
      guardianEmail: `danladi.bello-${Date.now()}@example.com`,
      guardianPhone: '+2348099990000',
      guardianRelationship: RelationshipType.FATHER,
      programmeSelections: [{ programmeId: primaryProgId }],
    });

    await submitApplication(app.id);

    // Administrative payment verification with payment reference
    const confirmed = await confirmApplicationPayment(adminUser, app.id, {
      paymentReference: `PAY-REF-${Date.now()}`,
      amountPaidKobo: app.totalAmountKobo,
    });

    expect(confirmed.paymentStatus).toBe(ApplicationPaymentStatus.PAYMENT_CONFIRMED);
    expect(confirmed.status).toBe(ApplicationStatus.UNDER_REVIEW);

    const reloaded = await getApplicationById(adminUser, app.id);
    expect(reloaded.paymentReference).toMatch(/^PAY-REF-/);
    expect(reloaded.amountPaidKobo).toBe(app.totalAmountKobo);
  });
});
