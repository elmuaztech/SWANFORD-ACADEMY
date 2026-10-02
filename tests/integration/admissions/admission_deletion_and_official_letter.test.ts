import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  AdmissionCycleStatus,
  ApplicationStatus,
  Gender,
  GatewayTransactionStatus,
  ProgrammeCode,
  RelationshipType,
  RoleCode,
  TermCode,
} from '@prisma/client';
import {
  createDraftApplication,
  submitApplication,
  confirmApplicationPayment,
  reviewProgrammeSelection,
  deleteApplication,
} from '@/lib/admissions/application_service';
import { createAdmissionCycle, setProgrammeAvailability } from '@/lib/admissions/cycle_service';
import { matriculateApplication } from '@/lib/admissions/matriculation_service';
import { getAdminDashboardMetrics } from '@/lib/admin/admin_service';
import { SafeUser } from '@/lib/auth/service';

describe('Integration: Admission Application Deletion, Official Letter & Finance Digit Updates', () => {
  let adminUser: SafeUser;
  let academicSessionId: string;
  let cycleId: string;
  let primaryProgId: string;
  let primaryClassId: string;

  beforeEach(async () => {
    // 1. Setup Session and Term
    const session = await prisma.academicSession.create({
      data: {
        name: `Admission-Letter-Session-${Date.now()}`,
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

    // 2. Setup Super Admin User
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.SUPER_ADMIN } });
    const user = await prisma.user.create({
      data: {
        email: `admission-admin-${Date.now()}@example.com`,
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
      roles: [RoleCode.SUPER_ADMIN],
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      createdAt: new Date(),
    };

    // 3. Programmes & Classes
    const primaryProg = await prisma.programme.upsert({
      where: { code: ProgrammeCode.PRIMARY },
      update: {},
      create: {
        code: ProgrammeCode.PRIMARY,
        name: 'Primary Education',
        description: 'Basic primary curriculum',
      },
    });
    primaryProgId = primaryProg.id;

    const schoolClass = await prisma.schoolClass.create({
      data: {
        code: `PRI-1A-${Date.now()}`,
        name: `Primary 1A-${Date.now()}`,
        programmeId: primaryProgId,
        capacity: 30,
      },
    });
    primaryClassId = schoolClass.id;

    // 4. Admission Cycle
    const cycle = await createAdmissionCycle(adminUser, {
      name: `2026/2027 Admission Cycle-${Date.now()}`,
      code: `CYCLE-${Date.now()}`,
      academicSessionId,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
    });
    cycleId = cycle.id;

    await prisma.admissionCycle.update({
      where: { id: cycleId },
      data: { status: AdmissionCycleStatus.OPEN },
    });

    await setProgrammeAvailability(adminUser, cycleId, primaryProgId, { status: 'OPEN' });
  });

  it('allows admin to delete an un-enrolled application and removes related records', async () => {
    // 1. Create and submit an application
    const app = await createDraftApplication({
      admissionCycleId: cycleId,
      applicantFirstName: 'Zainab',
      applicantLastName: 'Bello',
      applicantGender: Gender.FEMALE,
      applicantDob: new Date('2019-05-12'),
      guardianFirstName: 'Umar',
      guardianLastName: 'Bello',
      guardianEmail: `umar.bello.${Date.now()}@example.com`,
      guardianPhone: '+2348039991122',
      guardianRelationship: RelationshipType.FATHER,
      programmeSelections: [{ programmeId: primaryProgId }],
    });

    await submitApplication(app.id);

    // Verify application and selection exist
    const beforeCount = await prisma.application.count({ where: { id: app.id } });
    expect(beforeCount).toBe(1);

    const selectionsBefore = await prisma.applicationProgrammeSelection.count({
      where: { applicationId: app.id },
    });
    expect(selectionsBefore).toBeGreaterThan(0);

    // 2. Admin deletes the application
    const deleteResult = await deleteApplication(adminUser, app.id);
    expect(deleteResult.success).toBe(true);

    // 3. Application and dependent selections are deleted
    const afterCount = await prisma.application.count({ where: { id: app.id } });
    expect(afterCount).toBe(0);

    const selectionsAfter = await prisma.applicationProgrammeSelection.count({
      where: { applicationId: app.id },
    });
    expect(selectionsAfter).toBe(0);

    // 4. Audit log exists
    const auditLog = await prisma.auditLog.findFirst({
      where: { entityId: app.id, action: 'APPLICATION_DELETED' },
    });
    expect(auditLog).not.toBeNull();
  });

  it('strictly forbids deleting an already ENROLLED application', async () => {
    const app = await createDraftApplication({
      admissionCycleId: cycleId,
      applicantFirstName: 'Faruk',
      applicantLastName: 'Aliyu',
      applicantGender: Gender.MALE,
      applicantDob: new Date('2018-03-10'),
      guardianFirstName: 'Aliyu',
      guardianLastName: 'Faruk',
      guardianEmail: `aliyu.faruk.${Date.now()}@example.com`,
      guardianPhone: '+2348021112233',
      guardianRelationship: RelationshipType.FATHER,
      programmeSelections: [{ programmeId: primaryProgId }],
    });

    await submitApplication(app.id);
    await confirmApplicationPayment(adminUser, app.id, {
      paymentReference: `MANUAL-${Date.now()}`,
      amountPaidKobo: BigInt(500000),
    });

    const refreshed = await prisma.application.findUniqueOrThrow({
      where: { id: app.id },
      include: { programmeSelections: true },
    });

    // Super Admin approves
    await reviewProgrammeSelection(adminUser, refreshed.programmeSelections[0].id, {
      decision: 'APPROVED',
      decisionNotes: 'Approved for Primary placement',
    });

    // Matriculate into student
    await matriculateApplication(adminUser, {
      applicationId: app.id,
      programmeClassAssignments: { [primaryProgId]: primaryClassId },
    });

    const enrolledApp = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(enrolledApp.status).toBe(ApplicationStatus.ENROLLED);

    // Attempt delete -> must fail with 400
    await expect(deleteApplication(adminUser, app.id)).rejects.toThrow(
      'Cannot delete an application for a student who is already enrolled in the institution.'
    );
  });

  it('automatically dispatches branded official admission letter on approval and updates decision email with reason on rejection', async () => {
    // 1. Create candidate A (To be Approved)
    const appA = await createDraftApplication({
      admissionCycleId: cycleId,
      applicantFirstName: 'Maryam',
      applicantLastName: 'Dutse',
      applicantGender: Gender.FEMALE,
      applicantDob: new Date('2020-01-15'),
      guardianFirstName: 'Ibrahim',
      guardianLastName: 'Dutse',
      guardianEmail: `ibrahim.dutse.${Date.now()}@example.com`,
      guardianPhone: '+2348030004455',
      guardianRelationship: RelationshipType.FATHER,
      programmeSelections: [{ programmeId: primaryProgId }],
    });

    await submitApplication(appA.id);
    const refreshedA = await prisma.application.findUniqueOrThrow({
      where: { id: appA.id },
      include: { programmeSelections: true },
    });

    // Approve candidate A
    await reviewProgrammeSelection(adminUser, refreshedA.programmeSelections[0].id, {
      decision: 'APPROVED',
      decisionNotes: 'Excellent performance in assessment interview.',
    });

    // Verify official admission letter notification was enqueued
    const notifApproved = await prisma.notification.findFirst({
      where: {
        idempotencyKey: { contains: `ADMISSION_LETTER:APPROVED:${appA.id}` },
      },
    });
    expect(notifApproved).not.toBeNull();
    expect(notifApproved?.subject).toContain('Official Admission Letter for Maryam Dutse');
    expect(notifApproved?.htmlBody).toContain('SWANFORD ACADEMY');
    expect(notifApproved?.htmlBody).toContain('OFFICIAL OFFER OF PROVISIONAL ADMISSION');
    expect(notifApproved?.htmlBody).toContain(`/admissions/letter/${appA.id}`);

    // 2. Create candidate B (To be Rejected)
    const appB = await createDraftApplication({
      admissionCycleId: cycleId,
      applicantFirstName: 'Mustapha',
      applicantLastName: 'Garba',
      applicantGender: Gender.MALE,
      applicantDob: new Date('2020-04-20'),
      guardianFirstName: 'Garba',
      guardianLastName: 'Mustapha',
      guardianEmail: `garba.mustapha.${Date.now()}@example.com`,
      guardianPhone: '+2348030007788',
      guardianRelationship: RelationshipType.FATHER,
      programmeSelections: [{ programmeId: primaryProgId }],
    });

    await submitApplication(appB.id);
    const refreshedB = await prisma.application.findUniqueOrThrow({
      where: { id: appB.id },
      include: { programmeSelections: true },
    });

    const rejectionReason = 'Candidate screening score fell below minimum numeracy prerequisite threshold.';
    await reviewProgrammeSelection(adminUser, refreshedB.programmeSelections[0].id, {
      decision: 'REJECTED',
      decisionNotes: rejectionReason,
    });

    // Verify decision email with exact reason was enqueued
    const notifRejected = await prisma.notification.findFirst({
      where: {
        idempotencyKey: { contains: `ADMISSION_DECISION:REJECTED:${appB.id}` },
      },
    });
    expect(notifRejected).not.toBeNull();
    expect(notifRejected?.bodyText).toContain(rejectionReason);
    expect(notifRejected?.htmlBody).toContain(rejectionReason);
  });

  it('updates dashboard finance digits and payments center when an application payment is confirmed', async () => {
    // Check initial dashboard metrics
    const initialMetrics = await getAdminDashboardMetrics(adminUser);
    const initialCollected = BigInt(initialMetrics.finance?.totalCollectedKobo || '0');

    // Create and confirm payment for an application
    const app = await createDraftApplication({
      admissionCycleId: cycleId,
      applicantFirstName: 'Khadija',
      applicantLastName: 'Usman',
      applicantGender: Gender.FEMALE,
      applicantDob: new Date('2020-08-10'),
      guardianFirstName: 'Usman',
      guardianLastName: 'Abubakar',
      guardianEmail: `usman.abubakar.${Date.now()}@example.com`,
      guardianPhone: '+2348035551122',
      guardianRelationship: RelationshipType.FATHER,
      programmeSelections: [{ programmeId: primaryProgId }],
    });

    await submitApplication(app.id);

    const feeAmountKobo = BigInt(500000); // ₦5,000
    const paymentRef = `CONFIRM-TEST-${Date.now()}`;

    await confirmApplicationPayment(adminUser, app.id, {
      paymentReference: paymentRef,
      amountPaidKobo: feeAmountKobo,
    });

    // 1. PaymentTransaction is recorded
    const transaction = await prisma.paymentTransaction.findUnique({
      where: { gatewayReference: paymentRef },
    });
    expect(transaction).not.toBeNull();
    expect(transaction?.status).toBe(GatewayTransactionStatus.SUCCESS);
    expect(transaction?.amountKobo).toBe(feeAmountKobo);

    // 2. Admin dashboard financial metrics reflect the active digits (not 0)
    const updatedMetrics = await getAdminDashboardMetrics(adminUser);
    const updatedCollected = BigInt(updatedMetrics.finance?.totalCollectedKobo || '0');
    expect(updatedCollected).toBe(initialCollected + feeAmountKobo);

    // 3. Recent payments on admin dashboard includes the application payment
    const recentAppPayment = updatedMetrics.recentPayments.find(
      (p) => p.paymentReference === paymentRef
    );
    expect(recentAppPayment).toBeDefined();
    expect(recentAppPayment?.amountPaidKobo).toBe(feeAmountKobo);
    expect(recentAppPayment?.application?.applicantFirstName).toBe('Khadija');
    expect(recentAppPayment?.receiptNumber).toBe(`REC-${app.applicationNumber}`);
  });
});
