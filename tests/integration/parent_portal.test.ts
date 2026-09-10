import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  Gender,
  StudentStatus,
  RoleCode,
  ProgrammeCode,
  RelationshipType,
  AssessmentType,
  AssessmentStatus,
  AssessmentScoreStatus,
  InvoiceStatus,
  EnrollmentType,
  NotificationCategory,
  NotificationChannel,
} from '@prisma/client';
import { SafeUser } from '@/lib/auth/service';
import {
  getParentChildAttendance,
  getParentChildResults,
  getParentChildFinance,
  getParentAdmissions,
  updateParentNotificationPreferences,
} from '@/lib/parent/parent_service';

describe('Stage 11 — Integration: Parent Portal Child Isolation, Results & Finance Boundaries', () => {
  let parent1User: SafeUser;
  let parent2User: SafeUser;
  let parent1GuardianId: string;
  let parent2GuardianId: string;

  let child1Id: string; // Belongs to Parent 1
  let child2Id: string; // Belongs to Parent 2
  let child3Id: string; // Second child of Parent 1 (multi-child)

  let academicSessionId: string;
  let academicTermId: string;
  let admissionCycleId: string;
  let primaryProgrammeId: string;
  let tahfeezProgrammeId: string;
  let schoolClassId: string;
  let tahfeezClassId: string;
  let gradingScaleId: string;

  let draftAssessmentId: string;
  let submittedAssessmentId: string;
  let finalizedAssessmentId: string;

  let invoiceWithAccessId: string;
  let verifiedAppId: string;
  let unlinkedEmailAppId: string;

  beforeEach(async () => {
    // 1. Academic Hierarchy
    const session = await prisma.academicSession.create({
      data: {
        name: `Parent-Sess-${Date.now()}`,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-07-31'),
        isCurrent: true,
      },
    });
    academicSessionId = session.id;

    const term = await prisma.academicTerm.create({
      data: {
        academicSessionId: session.id,
        termCode: 'FIRST',
        name: 'First Term',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-12-15'),
        isCurrent: true,
      },
    });
    academicTermId = term.id;

    const cycle = await prisma.admissionCycle.create({
      data: {
        academicSessionId: session.id,
        code: `CYC-${Date.now()}`,
        name: `Cycle-${Date.now()}`,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-08-31'),
      },
    });
    admissionCycleId = cycle.id;

    const primaryProg = await prisma.programme.findUniqueOrThrow({
      where: { code: ProgrammeCode.PRIMARY },
    });
    primaryProgrammeId = primaryProg.id;

    const tahfeezProg = await prisma.programme.findUniqueOrThrow({
      where: { code: ProgrammeCode.TAHFEEZ },
    });
    tahfeezProgrammeId = tahfeezProg.id;

    const schoolClass = await prisma.schoolClass.create({
      data: {
        programmeId: primaryProgrammeId,
        code: `PRNT-CLS-${Date.now()}`,
        name: 'Primary 4C',
        capacity: 30,
      },
    });
    schoolClassId = schoolClass.id;

    const tahClass = await prisma.schoolClass.create({
      data: {
        programmeId: tahfeezProgrammeId,
        code: `PRNT-TAH-${Date.now()}`,
        name: 'Tahfeez Halaqah A',
        capacity: 20,
      },
    });
    tahfeezClassId = tahClass.id;

    const scale = await prisma.gradingScale.findFirstOrThrow();
    gradingScaleId = scale.id;

    // 2. Roles & Parents
    const parentRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.PARENT } });

    // Parent 1
    const u1 = await prisma.user.create({
      data: { email: `parent1-${Date.now()}@example.com`, passwordHash: 'hash', status: 'ACTIVE' },
    });
    await prisma.userRole.create({ data: { userId: u1.id, roleId: parentRole.id } });
    const g1 = await prisma.guardian.create({
      data: {
        userId: u1.id,
        firstName: 'Amina',
        lastName: 'Suleiman',
        email: u1.email,
      },
    });
    parent1GuardianId = g1.id;
    parent1User = {
      id: u1.id,
      email: u1.email,
      phoneNumber: null,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      createdAt: new Date(),
      guardianId: g1.id,
    };

    // Parent 2
    const u2 = await prisma.user.create({
      data: { email: `parent2-${Date.now()}@example.com`, passwordHash: 'hash', status: 'ACTIVE' },
    });
    await prisma.userRole.create({ data: { userId: u2.id, roleId: parentRole.id } });
    const g2 = await prisma.guardian.create({
      data: {
        userId: u2.id,
        firstName: 'Bello',
        lastName: 'Yakubu',
        email: u2.email,
      },
    });
    parent2GuardianId = g2.id;
    parent2User = {
      id: u2.id,
      email: u2.email,
      phoneNumber: null,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      createdAt: new Date(),
      guardianId: g2.id,
    };

    // 3. Students
    const c1 = await prisma.student.create({
      data: {
        admissionNumber: `STU-P1-${Date.now()}`,
        firstName: 'Maryam',
        lastName: 'Suleiman',
        gender: Gender.FEMALE,
        dateOfBirth: new Date('2016-01-10'),
        currentStatus: StudentStatus.ACTIVE,
      },
    });
    child1Id = c1.id;

    const c2 = await prisma.student.create({
      data: {
        admissionNumber: `STU-P2-${Date.now()}`,
        firstName: 'Usman',
        lastName: 'Yakubu',
        gender: Gender.MALE,
        dateOfBirth: new Date('2016-03-15'),
        currentStatus: StudentStatus.ACTIVE,
      },
    });
    child2Id = c2.id;

    const c3 = await prisma.student.create({
      data: {
        admissionNumber: `STU-P3-${Date.now()}`,
        firstName: 'Bilal',
        lastName: 'Suleiman',
        gender: Gender.MALE,
        dateOfBirth: new Date('2018-05-20'),
        currentStatus: StudentStatus.ACTIVE,
      },
    });
    child3Id = c3.id;

    // Link Parent 1 to Child 1 (receivesInvoices: true)
    await prisma.guardianStudentRelationship.create({
      data: {
        guardianId: parent1GuardianId,
        studentId: child1Id,
        relationshipType: RelationshipType.MOTHER,
        isPrimaryContact: true,
        receivesInvoices: true,
        status: 'ACTIVE',
      },
    });

    // Link Parent 1 to Child 3 (receivesInvoices: false) -> testing invoice gating
    await prisma.guardianStudentRelationship.create({
      data: {
        guardianId: parent1GuardianId,
        studentId: child3Id,
        relationshipType: RelationshipType.MOTHER,
        isPrimaryContact: true,
        receivesInvoices: false,
        status: 'ACTIVE',
      },
    });

    // Link Parent 2 to Child 2
    await prisma.guardianStudentRelationship.create({
      data: {
        guardianId: parent2GuardianId,
        studentId: child2Id,
        relationshipType: RelationshipType.FATHER,
        isPrimaryContact: true,
        receivesInvoices: true,
        status: 'ACTIVE',
      },
    });

    // Enrollments
    await prisma.studentProgrammeEnrollment.create({
      data: {
        studentId: child1Id,
        programmeId: primaryProgrammeId,
        schoolClassId,
        academicSessionId,
        academicTermId,
        enrollmentStatus: 'ACTIVE',
        enrollmentType: EnrollmentType.MAIN_ACADEMIC,
      },
    });

    // Child 1 also enrolled in Tahfeez (multi-programme child)
    await prisma.studentProgrammeEnrollment.create({
      data: {
        studentId: child1Id,
        programmeId: tahfeezProgrammeId,
        schoolClassId: tahfeezClassId,
        academicSessionId,
        academicTermId,
        enrollmentStatus: 'ACTIVE',
        enrollmentType: EnrollmentType.ADDITIONAL_PROGRAMME,
      },
    });

    // 4. Assessments with different statuses
    const draftAss = await prisma.assessment.create({
      data: {
        title: 'Draft Quiz',
        type: AssessmentType.CONTINUOUS_ASSESSMENT,
        programmeId: primaryProgrammeId,
        schoolClassId,
        academicSessionId,
        academicTermId,
        gradingScaleId,
        maxScore: 20,
        weightPercentage: 10,
        status: AssessmentStatus.DRAFT,
        createdById: u1.id,
      },
    });
    draftAssessmentId = draftAss.id;
    await prisma.assessmentScore.create({
      data: {
        assessmentId: draftAss.id,
        studentId: child1Id,
        rawScore: 18,
        grade: 'A',
        scoreStatus: AssessmentScoreStatus.SCORED,
      },
    });

    const submittedAss = await prisma.assessment.create({
      data: {
        title: 'Submitted Exam',
        type: AssessmentType.EXAMINATION,
        programmeId: primaryProgrammeId,
        schoolClassId,
        academicSessionId,
        academicTermId,
        gradingScaleId,
        maxScore: 60,
        weightPercentage: 60,
        status: AssessmentStatus.SUBMITTED,
        createdById: u1.id,
      },
    });
    submittedAssessmentId = submittedAss.id;
    await prisma.assessmentScore.create({
      data: {
        assessmentId: submittedAss.id,
        studentId: child1Id,
        rawScore: 54,
        grade: 'A',
        scoreStatus: AssessmentScoreStatus.SCORED,
      },
    });

    const finalizedAss = await prisma.assessment.create({
      data: {
        title: 'Finalized CA',
        type: AssessmentType.CONTINUOUS_ASSESSMENT,
        programmeId: primaryProgrammeId,
        schoolClassId,
        academicSessionId,
        academicTermId,
        gradingScaleId,
        maxScore: 40,
        weightPercentage: 30,
        status: AssessmentStatus.FINALIZED,
        createdById: u1.id,
      },
    });
    finalizedAssessmentId = finalizedAss.id;
    await prisma.assessmentScore.create({
      data: {
        assessmentId: finalizedAss.id,
        studentId: child1Id,
        rawScore: 35,
        grade: 'A',
        points: 5,
        remark: 'Excellent',
        isPass: true,
        scoreStatus: AssessmentScoreStatus.SCORED,
      },
    });

    // 5. Invoices
    const inv = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-P1-${Date.now()}`,
        studentId: child1Id,
        guardianId: parent1GuardianId,
        academicSessionId,
        academicTermId,
        programmeId: primaryProgrammeId,
        totalAmountKobo: BigInt(15000000),
        amountPaidKobo: BigInt(5000000),
        outstandingBalanceKobo: BigInt(10000000),
        status: InvoiceStatus.PARTIALLY_PAID,
        dueDate: new Date('2026-11-01'),
      },
    });
    invoiceWithAccessId = inv.id;

    await prisma.invoiceItem.create({
      data: {
        invoiceId: inv.id,
        description: 'Tuition Fee',
        unitAmountKobo: BigInt(15000000),
        quantity: 1,
        totalAmountKobo: BigInt(15000000),
      },
    });

    // 6. Admissions: Verified vs Email-Only Matching
    const verifiedApp = await prisma.application.create({
      data: {
        applicationNumber: `APP-VER-${Date.now()}`,
        academicSessionId,
        admissionCycleId,
        applicantFirstName: 'Aisha',
        applicantLastName: 'Suleiman',
        applicantGender: Gender.FEMALE,
        applicantDob: new Date('2020-04-01'),
        guardianFirstName: 'Amina',
        guardianLastName: 'Suleiman',
        guardianEmail: u1.email,
        guardianPhone: '+2348000000000',
        guardianRelationship: RelationshipType.MOTHER,
        existingGuardianId: parent1GuardianId, // Verified relation!
        status: 'SUBMITTED',
      },
    });
    verifiedAppId = verifiedApp.id;

    const unlinkedApp = await prisma.application.create({
      data: {
        applicationNumber: `APP-UNLINK-${Date.now()}`,
        academicSessionId,
        admissionCycleId,
        applicantFirstName: 'Imposter',
        applicantLastName: 'Suleiman',
        applicantGender: Gender.MALE,
        applicantDob: new Date('2020-06-01'),
        guardianFirstName: 'Another',
        guardianLastName: 'Person',
        guardianEmail: u1.email, // Email happens to match! But existingGuardianId is null
        guardianPhone: '+2348111111111',
        guardianRelationship: RelationshipType.LEGAL_GUARDIAN,
        existingGuardianId: null,
        status: 'SUBMITTED',
      },
    });
    unlinkedEmailAppId = unlinkedApp.id;
  });

  afterEach(async () => {
    await prisma.notificationPreference.deleteMany({
      where: { userId: { in: [parent1User.id, parent2User.id] } },
    });
    await prisma.application.deleteMany({
      where: { id: { in: [verifiedAppId, unlinkedEmailAppId] } },
    });
    await prisma.admissionCycle.deleteMany({
      where: { id: admissionCycleId },
    });
    await prisma.invoiceItem.deleteMany({
      where: { invoiceId: invoiceWithAccessId },
    });
    await prisma.invoice.deleteMany({
      where: { id: invoiceWithAccessId },
    });
    await prisma.assessmentScore.deleteMany({
      where: { studentId: { in: [child1Id, child2Id, child3Id] } },
    });
    await prisma.assessment.deleteMany({
      where: { id: { in: [draftAssessmentId, submittedAssessmentId, finalizedAssessmentId] } },
    });
    await prisma.guardianStudentRelationship.deleteMany({
      where: { guardianId: { in: [parent1GuardianId, parent2GuardianId] } },
    });
    await prisma.studentProgrammeEnrollment.deleteMany({
      where: { studentId: { in: [child1Id, child2Id, child3Id] } },
    });
    await prisma.student.deleteMany({
      where: { id: { in: [child1Id, child2Id, child3Id] } },
    });
    await prisma.schoolClass.deleteMany({
      where: { id: { in: [schoolClassId, tahfeezClassId] } },
    });
    await prisma.academicTerm.deleteMany({
      where: { id: academicTermId },
    });
    await prisma.academicSession.deleteMany({
      where: { id: academicSessionId },
    });
    await prisma.guardian.deleteMany({
      where: { id: { in: [parent1GuardianId, parent2GuardianId] } },
    });
    await prisma.userRole.deleteMany({
      where: { userId: { in: [parent1User.id, parent2User.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [parent1User.id, parent2User.id] } },
    });
  });

  // 1. Child Isolation & IDOR
  it('rejects Parent 1 accessing Child 2 belonging to Parent 2 (403 Forbidden)', async () => {
    await expect(
      getParentChildAttendance(parent1User.id, child2Id)
    ).rejects.toThrow('Access denied: You are not authorized');
  });

  it('rejects tampered or non-existent student ID (403 Forbidden)', async () => {
    await expect(
      getParentChildResults(parent1User.id, '00000000-0000-0000-0000-000000000000')
    ).rejects.toThrow('Access denied: You are not authorized');
  });

  // 2. Results Isolation (Only FINALIZED visible)
  it('hides DRAFT and SUBMITTED assessments from parents; exposes only FINALIZED results', async () => {
    const results = await getParentChildResults(parent1User.id, child1Id);

    expect(results.scores).toBeDefined();
    expect(results.scores).toHaveLength(1);
    expect(results.scores![0].title).toBe('Finalized CA');
    expect(results.scores![0].grade).toBe('A');

    // Ensure neither DRAFT nor SUBMITTED appear in the list
    const assessmentTitles = results.scores!.map((a) => a.title);
    expect(assessmentTitles).not.toContain('Draft Quiz');
    expect(assessmentTitles).not.toContain('Submitted Exam');
  });

  // 3. Finance Isolation (receivesInvoices enforcement)
  it('exposes invoices and balance when guardian has receivesInvoices: true', async () => {
    const invoices = await getParentChildFinance(parent1User.id, child1Id);

    expect(invoices).toHaveLength(1);
    expect(invoices[0].invoiceNumber).toContain('INV-P1');
    expect(invoices[0].totalAmountKobo).toBe('15000000');
    expect(invoices[0].outstandingBalanceKobo).toBe('10000000');
  });

  it('strictly rejects financial records when receivesInvoices: false (403 Forbidden)', async () => {
    await expect(
      getParentChildFinance(parent1User.id, child3Id) // Child 3 has receivesInvoices: false
    ).rejects.toThrow('Access restricted: You are not designated to receive financial invoices');
  });

  // 4. Admission Security (Email matching alone is NOT authorized)
  it('exposes only verified guardian admission applications; rejects email-only match', async () => {
    const apps = await getParentAdmissions(parent1User.id);

    expect(apps).toHaveLength(1);
    expect(apps[0].id).toBe(verifiedAppId);
    expect(apps[0].studentName).toBe('Aisha Suleiman');

    // Imposter application with matching email is strictly excluded!
    const appIds = apps.map((a) => a.id);
    expect(appIds).not.toContain(unlinkedEmailAppId);
  });

  // 5. Notification Preferences
  it('updates notification preferences successfully for parent', async () => {
    const updated = await updateParentNotificationPreferences(parent1User.id, [
      {
        category: NotificationCategory.ACADEMIC,
        channel: NotificationChannel.EMAIL,
        enabled: false,
      },
    ]);

    expect(updated).toBeDefined();

    // Verify preference in database
    const pref = await prisma.notificationPreference.findUnique({
      where: {
        userId_category_channel: {
          userId: parent1User.id,
          category: NotificationCategory.ACADEMIC,
          channel: NotificationChannel.EMAIL,
        },
      },
    });
    expect(pref?.enabled).toBe(false);
  });
});
