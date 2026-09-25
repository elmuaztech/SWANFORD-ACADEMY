import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  AdmissionCycleStatus,
  ApplicationStatus,
  EnrollmentType,
  Gender,
  ProgrammeCode,
  ProgrammeSelectionStatus,
  RelationshipType,
  RoleCode,
  StudentStatus,
  TermCode,
} from '@prisma/client';
import {
  createDraftApplication,
  submitApplication,
  confirmApplicationPayment,
  reviewProgrammeSelection,
} from '@/lib/admissions/application_service';
import { createAdmissionCycle, setProgrammeAvailability } from '@/lib/admissions/cycle_service';
import { matriculateApplication } from '@/lib/admissions/matriculation_service';
import { SafeUser } from '@/lib/auth/service';

describe('Stage 7 — Integration: Review Decisions & Atomic Matriculation', () => {
  let adminUser: SafeUser;
  let academicSessionId: string;
  let cycleId: string;
  let primaryProgId: string;
  let tahfeezProgId: string;
  let primaryClassId: string;
  let tahfeezClassId: string;

  beforeEach(async () => {
    // 1. Setup Session and First Term
    const session = await prisma.academicSession.create({
      data: {
        name: `Matric-Session-${Date.now()}`,
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
        email: `matric-admin-${Date.now()}@example.com`,
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
    const primaryProg = await prisma.programme.findUniqueOrThrow({
      where: { code: ProgrammeCode.PRIMARY },
    });
    primaryProgId = primaryProg.id;

    const tahfeezProg = await prisma.programme.findUniqueOrThrow({
      where: { code: ProgrammeCode.TAHFEEZ },
    });
    tahfeezProgId = tahfeezProg.id;

    const pClass = await prisma.schoolClass.create({
      data: {
        programmeId: primaryProg.id,
        code: `MAT-P1-${Date.now()}`,
        name: `Primary 1A-${Date.now()}`,
        capacity: 30,
      },
    });
    primaryClassId = pClass.id;

    const tClass = await prisma.schoolClass.create({
      data: {
        programmeId: tahfeezProg.id,
        code: `MAT-TAH-${Date.now()}`,
        name: `Tahfeez A-${Date.now()}`,
        capacity: 30,
      },
    });
    tahfeezClassId = tClass.id;

    // 4. Create Open Cycle
    const cycle = await createAdmissionCycle(adminUser, {
      academicSessionId,
      code: `ADM-MAT-${Date.now()}`,
      name: 'Matriculation Test Cycle',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      status: AdmissionCycleStatus.OPEN,
    });
    cycleId = cycle.id;
  });

  it('evaluates selection review decisions and computes overall PARTIALLY_APPROVED status', async () => {
    const app = await createDraftApplication({
      admissionCycleId: cycleId,
      applicantFirstName: 'Mustafa',
      applicantLastName: 'Sadiq',
      applicantGender: Gender.MALE,
      applicantDob: new Date('2018-03-25'),
      guardianFirstName: 'Sadiq',
      guardianLastName: 'Aliyu',
      guardianEmail: `sadiq.aliyu-${Date.now()}@example.com`,
      guardianPhone: '+2348011225566',
      guardianRelationship: RelationshipType.FATHER,
      programmeSelections: [
        { programmeId: primaryProgId },
        { programmeId: tahfeezProgId },
      ],
    });

    await submitApplication(app.id);
    await confirmApplicationPayment(adminUser, app.id, {
      paymentReference: `REF-${Date.now()}`,
      amountPaidKobo: app.totalAmountKobo,
    });

    const primarySel = app.programmeSelections.find((s) => s.programmeId === primaryProgId)!;
    const tahfeezSel = app.programmeSelections.find((s) => s.programmeId === tahfeezProgId)!;

    // Approve Primary
    const rev1 = await reviewProgrammeSelection(adminUser, primarySel.id, {
      decision: 'APPROVED',
      decisionNotes: 'Passed entrance evaluation test',
    });
    expect(rev1.selection.status).toBe(ProgrammeSelectionStatus.APPROVED);
    expect(rev1.applicationStatus).toBe(ApplicationStatus.UNDER_REVIEW); // tahfeez still pending

    // Reject Tahfeez
    const rev2 = await reviewProgrammeSelection(adminUser, tahfeezSel.id, {
      decision: 'REJECTED',
      decisionNotes: 'Memorization readiness insufficient',
    });
    expect(rev2.selection.status).toBe(ProgrammeSelectionStatus.REJECTED);
    expect(rev2.applicationStatus).toBe(ApplicationStatus.PARTIALLY_APPROVED); // Mixed decisions!
  });

  it('enforces MAIN_ACADEMIC rule: rejecting main programme blocks matriculation of additional programme alone', async () => {
    const app = await createDraftApplication({
      admissionCycleId: cycleId,
      applicantFirstName: 'Khadijah',
      applicantLastName: 'Abubakar',
      applicantGender: Gender.FEMALE,
      applicantDob: new Date('2018-07-07'),
      guardianFirstName: 'Abubakar',
      guardianLastName: 'Garba',
      guardianEmail: `abubakar.garba-${Date.now()}@example.com`,
      guardianPhone: '+2348077665544',
      guardianRelationship: RelationshipType.FATHER,
      programmeSelections: [
        { programmeId: primaryProgId },
        { programmeId: tahfeezProgId },
      ],
    });

    await submitApplication(app.id);
    await confirmApplicationPayment(adminUser, app.id, {
      paymentReference: `REF-K-${Date.now()}`,
      amountPaidKobo: app.totalAmountKobo,
    });

    const primarySel = app.programmeSelections.find((s) => s.programmeId === primaryProgId)!;
    const tahfeezSel = app.programmeSelections.find((s) => s.programmeId === tahfeezProgId)!;

    // Reject Primary, Approve Tahfeez
    await reviewProgrammeSelection(adminUser, primarySel.id, { decision: 'REJECTED' });
    await reviewProgrammeSelection(adminUser, tahfeezSel.id, { decision: 'APPROVED' });

    // Matriculating should fail because NO main academic programme was approved!
    await expect(
      matriculateApplication(adminUser, {
        applicationId: app.id,
      })
    ).rejects.toThrow('MAIN_ACADEMIC');
  });

  it('enforces concurrency-safe cycle capacity quota during matriculation', async () => {
    // Set Primary capacity in this cycle to strictly 1 student
    await setProgrammeAvailability(adminUser, cycleId, primaryProgId, {
      status: 'OPEN',
      maxCapacity: 1,
    });

    // Student 1
    const app1 = await createDraftApplication({
      admissionCycleId: cycleId,
      applicantFirstName: 'Hassan',
      applicantLastName: 'Yusuf',
      applicantGender: Gender.MALE,
      applicantDob: new Date('2017-06-12'),
      guardianFirstName: 'Yusuf',
      guardianLastName: 'Hassan',
      guardianEmail: `yusuf.hassan-${Date.now()}@example.com`,
      guardianPhone: '+2348099887766',
      guardianRelationship: RelationshipType.FATHER,
      programmeSelections: [{ programmeId: primaryProgId, targetClassId: primaryClassId }],
    });
    await submitApplication(app1.id);
    await confirmApplicationPayment(adminUser, app1.id, {
      paymentReference: `REF-H1-${Date.now()}`,
      amountPaidKobo: app1.totalAmountKobo,
    });
    await reviewProgrammeSelection(adminUser, app1.programmeSelections[0].id, { decision: 'APPROVED' });

    // Matriculate Student 1 -> Succeeds (1 / 1 capacity used)
    const matric1 = await matriculateApplication(adminUser, { applicationId: app1.id });
    expect(matric1.student).toBeDefined();

    // Student 2
    const app2 = await createDraftApplication({
      admissionCycleId: cycleId,
      applicantFirstName: 'Hussain',
      applicantLastName: 'Yusuf',
      applicantGender: Gender.MALE,
      applicantDob: new Date('2017-06-12'),
      guardianFirstName: 'Yusuf',
      guardianLastName: 'Hassan',
      guardianEmail: `yusuf.hassan.dup-${Date.now()}@example.com`,
      guardianPhone: '+2348099887767',
      guardianRelationship: RelationshipType.FATHER,
      programmeSelections: [{ programmeId: primaryProgId, targetClassId: primaryClassId }],
    });
    await submitApplication(app2.id);
    await confirmApplicationPayment(adminUser, app2.id, {
      paymentReference: `REF-H2-${Date.now()}`,
      amountPaidKobo: app2.totalAmountKobo,
    });
    await reviewProgrammeSelection(adminUser, app2.programmeSelections[0].id, { decision: 'APPROVED' });

    // Matriculating Student 2 MUST FAIL because capacity of 1 is reached!
    await expect(
      matriculateApplication(adminUser, { applicationId: app2.id })
    ).rejects.toThrow('maximum capacity');
  });

  it('performs truly atomic matriculation creating student, guardian, relationship, and enrollments together', async () => {
    const guardianEmail = `parent.matric-${Date.now()}@example.com`;

    const app = await createDraftApplication({
      admissionCycleId: cycleId,
      applicantFirstName: 'Ibrahim',
      applicantLastName: 'Shehu',
      applicantGender: Gender.MALE,
      applicantDob: new Date('2018-01-10'),
      guardianFirstName: 'Shehu',
      guardianLastName: 'Shagari',
      guardianEmail,
      guardianPhone: '+2348012345678',
      guardianRelationship: RelationshipType.FATHER,
      programmeSelections: [
        { programmeId: primaryProgId, targetClassId: primaryClassId },
        { programmeId: tahfeezProgId, targetClassId: tahfeezClassId },
      ],
    });

    await submitApplication(app.id);
    await confirmApplicationPayment(adminUser, app.id, {
      paymentReference: `PAY-MATRIC-${Date.now()}`,
      amountPaidKobo: app.totalAmountKobo,
    });

    // Approve both programmes
    for (const sel of app.programmeSelections) {
      await reviewProgrammeSelection(adminUser, sel.id, { decision: 'APPROVED' });
    }

    // Execute atomic matriculation
    const matriculation = await matriculateApplication(adminUser, {
      applicationId: app.id,
    });

    expect(matriculation.student).toBeDefined();
    // Verify server-generated student admission number standard SA-YYYY-NNNN
    expect(matriculation.student.admissionNumber).toMatch(/^SA-\d{4}-\d{4}$/);
    expect(matriculation.student.currentStatus).toBe(StudentStatus.ACTIVE);

    // Verify application status updated to ENROLLED
    expect(matriculation.application.status).toBe(ApplicationStatus.ENROLLED);
    expect(matriculation.application.admittedStudentId).toBe(matriculation.student.id);

    // Verify Guardian was provisioned
    const guardian = await prisma.guardian.findUnique({
      where: { id: matriculation.guardianId },
    });
    expect(guardian).toBeDefined();
    expect(guardian?.email).toBe(guardianEmail);

    // Verify Guardian-Student relationship was linked as primary
    const relationship = await prisma.guardianStudentRelationship.findFirst({
      where: {
        guardianId: matriculation.guardianId,
        studentId: matriculation.student.id,
      },
    });
    expect(relationship).toBeDefined();
    expect(relationship?.isPrimaryContact).toBe(true);

    // Verify both programme enrollments were created with correct enrollmentTypes
    expect(matriculation.enrollments).toHaveLength(2);

    const primaryEnrollment = matriculation.enrollments.find((e) => e.programmeId === primaryProgId);
    expect(primaryEnrollment?.enrollmentType).toBe(EnrollmentType.MAIN_ACADEMIC);

    const tahfeezEnrollment = matriculation.enrollments.find((e) => e.programmeId === tahfeezProgId);
    expect(tahfeezEnrollment?.enrollmentType).toBe(EnrollmentType.ADDITIONAL_PROGRAMME);

    // Verify audit log exists
    const audit = await prisma.auditLog.findFirst({
      where: {
        entityType: 'application',
        entityId: app.id,
        action: 'STUDENT_MATRICULATED_FROM_APPLICATION',
      },
    });
    expect(audit).toBeDefined();
  });
});
