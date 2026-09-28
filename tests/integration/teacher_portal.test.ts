import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  Gender,
  StudentStatus,
  RoleCode,
  ProgrammeCode,
  AttendanceStatus,
  AssessmentType,
  AssessmentStatus,
  AssessmentScoreStatus,
  EnrollmentType,
} from '@prisma/client';
import { SafeUser } from '@/lib/auth/service';
import { recordDailyAttendance } from '@/lib/attendance/attendance_service';
import {
  createAssessment,
  updateAssessmentScores,
  submitAssessment,
  finalizeAssessment,
  reopenAssessment,
} from '@/lib/assessment/assessment_service';
import { getTeacherClassRoster } from '@/lib/teacher/teacher_service';

describe('Stage 11 — Integration: Teacher Scope, Attendance & Assessment Lifecycle', () => {
  let adminUser: SafeUser;
  let teacherAUser: SafeUser;
  let teacherBUser: SafeUser;
  let teacherAProfileId: string;
  let teacherBProfileId: string;

  let academicSessionId: string;
  let otherSessionId: string;
  let academicTermId: string;
  let primaryProgrammeId: string;
  let tahfeezProgrammeId: string;
  let class5AId: string;
  let class5BId: string;
  let subjectMathId: string;
  let subjectEnglishId: string;
  let gradingScaleId: string;

  let student1Id: string;
  let student2Id: string;

  beforeEach(async () => {
    // 1. Sessions & Terms
    const session = await prisma.academicSession.create({
      data: {
        name: `Teacher-Sess-${Date.now()}`,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-07-31'),
        isCurrent: true,
      },
    });
    academicSessionId = session.id;

    const otherSession = await prisma.academicSession.create({
      data: {
        name: `Other-Sess-${Date.now()}`,
        startDate: new Date('2025-09-01'),
        endDate: new Date('2026-07-31'),
        isCurrent: false,
      },
    });
    otherSessionId = otherSession.id;

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

    // 2. Programmes
    const primaryProg = await prisma.programme.findUniqueOrThrow({
      where: { code: ProgrammeCode.PRIMARY },
    });
    primaryProgrammeId = primaryProg.id;

    const tahfeezProg = await prisma.programme.findUniqueOrThrow({
      where: { code: ProgrammeCode.TAHFEEZ },
    });
    tahfeezProgrammeId = tahfeezProg.id;

    // 3. Classes
    const c5a = await prisma.schoolClass.create({
      data: {
        programmeId: primaryProgrammeId,
        code: `CLS-5A-${Date.now()}`,
        name: 'Primary 5A',
        capacity: 30,
      },
    });
    class5AId = c5a.id;

    const c5b = await prisma.schoolClass.create({
      data: {
        programmeId: primaryProgrammeId,
        code: `CLS-5B-${Date.now()}`,
        name: 'Primary 5B',
        capacity: 30,
      },
    });
    class5BId = c5b.id;

    // 4. Subjects
    const sMath = await prisma.subject.create({
      data: {
        code: `MATH-${Date.now()}`,
        name: 'Mathematics',
        programmeId: primaryProgrammeId,
      },
    });
    subjectMathId = sMath.id;

    const sEng = await prisma.subject.create({
      data: {
        code: `ENG-${Date.now()}`,
        name: 'English Language',
        programmeId: primaryProgrammeId,
      },
    });
    subjectEnglishId = sEng.id;

    // 5. Grading Scale
    const scale = await prisma.gradingScale.findFirstOrThrow();
    gradingScaleId = scale.id;

    // 6. Students & Enrollments
    const s1 = await prisma.student.create({
      data: {
        admissionNumber: `STU-A-${Date.now()}`,
        firstName: 'Zaynab',
        lastName: 'Umar',
        gender: Gender.FEMALE,
        dateOfBirth: new Date('2015-04-12'),
        currentStatus: StudentStatus.ACTIVE,
        bloodGroup: 'O+',
        genotype: 'AA',
        medicalNotes: 'Sensitive allergy to penicillin',
      },
    });
    student1Id = s1.id;

    const s2 = await prisma.student.create({
      data: {
        admissionNumber: `STU-B-${Date.now()}`,
        firstName: 'Farouq',
        lastName: 'Umar',
        gender: Gender.MALE,
        dateOfBirth: new Date('2015-08-20'),
        currentStatus: StudentStatus.ACTIVE,
      },
    });
    student2Id = s2.id;

    // Student 1 enrolled in Class 5A
    await prisma.studentProgrammeEnrollment.create({
      data: {
        studentId: student1Id,
        programmeId: primaryProgrammeId,
        schoolClassId: class5AId,
        academicSessionId: session.id,
        academicTermId: term.id,
        enrollmentStatus: 'ACTIVE',
        enrollmentType: EnrollmentType.MAIN_ACADEMIC,
      },
    });

    // Student 2 enrolled in Class 5B
    await prisma.studentProgrammeEnrollment.create({
      data: {
        studentId: student2Id,
        programmeId: primaryProgrammeId,
        schoolClassId: class5BId,
        academicSessionId: session.id,
        academicTermId: term.id,
        enrollmentStatus: 'ACTIVE',
        enrollmentType: EnrollmentType.MAIN_ACADEMIC,
      },
    });

    // 7. Roles
    const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.SUPER_ADMIN } });
    const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.TEACHER } });

    // 8. Admin User
    const admin = await prisma.user.create({
      data: { email: `admin-tch-${Date.now()}@example.com`, passwordHash: 'hash', status: 'ACTIVE' },
    });
    await prisma.userRole.create({ data: { userId: admin.id, roleId: superAdminRole.id } });
    adminUser = {
      id: admin.id,
      email: admin.email,
      phoneNumber: null,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      createdAt: new Date(),
    };

    // 9. Teacher A (Assigned only to Class 5A, Subject: Mathematics)
    const uTeacherA = await prisma.user.create({
      data: { email: `teacherA-${Date.now()}@example.com`, passwordHash: 'hash', status: 'ACTIVE' },
    });
    await prisma.userRole.create({ data: { userId: uTeacherA.id, roleId: teacherRole.id } });
    const pTeacherA = await prisma.teacher.create({
      data: {
        userId: uTeacherA.id,
        staffIdNumber: `TCH-A-${Date.now()}`,
        firstName: 'Ahmad',
        lastName: 'Musa',
      },
    });
    teacherAProfileId = pTeacherA.id;

    await prisma.teacherScope.create({
      data: {
        teacherId: pTeacherA.id,
        academicSessionId: session.id,
        programmeId: primaryProgrammeId,
        schoolClassId: class5AId,
        subjectId: null, // Form teacher with class-wide authority
        isFormTeacher: true,
      },
    });

    teacherAUser = {
      id: uTeacherA.id,
      email: uTeacherA.email,
      phoneNumber: null,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      createdAt: new Date(),
      teacherId: pTeacherA.id,
    };

    // 10. Teacher B (Assigned to Class 5B, Subject: English)
    const uTeacherB = await prisma.user.create({
      data: { email: `teacherB-${Date.now()}@example.com`, passwordHash: 'hash', status: 'ACTIVE' },
    });
    await prisma.userRole.create({ data: { userId: uTeacherB.id, roleId: teacherRole.id } });
    const pTeacherB = await prisma.teacher.create({
      data: {
        userId: uTeacherB.id,
        staffIdNumber: `TCH-B-${Date.now()}`,
        firstName: 'Fatima',
        lastName: 'Aliyu',
      },
    });
    teacherBProfileId = pTeacherB.id;

    await prisma.teacherScope.create({
      data: {
        teacherId: pTeacherB.id,
        academicSessionId: session.id,
        programmeId: primaryProgrammeId,
        schoolClassId: class5BId,
        subjectId: subjectEnglishId,
        isFormTeacher: true,
      },
    });

    teacherBUser = {
      id: uTeacherB.id,
      email: uTeacherB.email,
      phoneNumber: null,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      createdAt: new Date(),
      teacherId: pTeacherB.id,
    };
  });

  afterEach(async () => {
    await prisma.assessmentScore.deleteMany({
      where: { studentId: { in: [student1Id, student2Id] } },
    });
    await prisma.assessment.deleteMany({
      where: { schoolClassId: { in: [class5AId, class5BId] } },
    });
    await prisma.attendanceRecord.deleteMany({
      where: { studentId: { in: [student1Id, student2Id] } },
    });
    await prisma.teacherScope.deleteMany({
      where: { teacherId: { in: [teacherAProfileId, teacherBProfileId] } },
    });
    await prisma.studentProgrammeEnrollment.deleteMany({
      where: { studentId: { in: [student1Id, student2Id] } },
    });
    await prisma.student.deleteMany({
      where: { id: { in: [student1Id, student2Id] } },
    });
    await prisma.subject.deleteMany({
      where: { id: { in: [subjectMathId, subjectEnglishId] } },
    });
    await prisma.schoolClass.deleteMany({
      where: { id: { in: [class5AId, class5BId] } },
    });
    await prisma.academicTerm.deleteMany({
      where: { id: academicTermId },
    });
    await prisma.academicSession.deleteMany({
      where: { id: { in: [academicSessionId, otherSessionId] } },
    });
    await prisma.academicSession.updateMany({
      where: { name: '2026/2027' },
      data: { isCurrent: true, status: 'ACTIVE' },
    });
    await prisma.teacher.deleteMany({
      where: { id: { in: [teacherAProfileId, teacherBProfileId] } },
    });
    await prisma.userRole.deleteMany({
      where: { userId: { in: [adminUser.id, teacherAUser.id, teacherBUser.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [adminUser.id, teacherAUser.id, teacherBUser.id] } },
    });
  });

  // 1. Teacher Scope Isolation Tests
  it('rejects Teacher A requesting Teacher B assigned class (403 Forbidden)', async () => {
    await expect(
      getTeacherClassRoster(teacherAUser.id, class5BId, primaryProgrammeId, academicSessionId)
    ).rejects.toThrow(/outside teacher assigned scope/);
  });

  it('rejects Teacher A requesting Tahfeez programme without Tahfeez scope (403 Forbidden)', async () => {
    await expect(
      createAssessment(teacherAUser, {
        title: 'Tahfeez Recitation Test',
        type: AssessmentType.TAHFEEZ_EVALUATION,
        programmeId: tahfeezProgrammeId,
        schoolClassId: class5AId,
        academicSessionId,
        academicTermId,
        gradingScaleId,
        maxScore: 100,
        weightPercentage: 20,
      })
    ).rejects.toThrow(/outside teacher assigned scope/);
  });

  it('rejects Teacher A creating assessment in another session outside their active scope (403 Forbidden)', async () => {
    await expect(
      createAssessment(teacherAUser, {
        title: 'Past Session Test',
        type: AssessmentType.CONTINUOUS_ASSESSMENT,
        programmeId: primaryProgrammeId,
        schoolClassId: class5AId,
        academicSessionId: otherSessionId,
        academicTermId,
        gradingScaleId,
        maxScore: 100,
        weightPercentage: 20,
      })
    ).rejects.toThrow(/Academic term does not belong to the requested academic session|outside teacher assigned scope/);
  });

  it('rejects Teacher B creating assessment for unauthorized subject (403 Forbidden)', async () => {
    await expect(
      createAssessment(teacherBUser, {
        title: 'Mathematics Test',
        type: AssessmentType.CONTINUOUS_ASSESSMENT,
        programmeId: primaryProgrammeId,
        schoolClassId: class5BId,
        subjectId: subjectMathId, // Teacher B only has English scope on Class 5B
        academicSessionId,
        academicTermId,
        gradingScaleId,
        maxScore: 100,
        weightPercentage: 20,
      })
    ).rejects.toThrow(/outside teacher assigned scope/);
  });

  // 2. Attendance Validation & Idempotency
  it('records daily attendance for an authorized class transactionally', async () => {
    const today = '2026-10-15';
    const result = await recordDailyAttendance(teacherAUser, {
      schoolClassId: class5AId,
      programmeId: primaryProgrammeId,
      academicSessionId,
      academicTermId,
      date: today,
      items: [
        {
          studentId: student1Id,
          status: AttendanceStatus.PRESENT,
          remarks: 'Arrived on time',
        },
      ],
    });

    expect(result.recordsCount).toBe(1);

    // Verify DB record
    const record = await prisma.attendanceRecord.findFirst({
      where: {
        studentId: student1Id,
        schoolClassId: class5AId,
      },
    });
    expect(record).not.toBeNull();
    expect(record?.status).toBe(AttendanceStatus.PRESENT);
  });

  it('preserves exactly one authoritative daily record on duplicate attendance submission (upsert)', async () => {
    const testDate = '2026-10-16';

    // 1st recording: PRESENT
    await recordDailyAttendance(teacherAUser, {
      schoolClassId: class5AId,
      programmeId: primaryProgrammeId,
      academicSessionId,
      academicTermId,
      date: testDate,
      items: [{ studentId: student1Id, status: AttendanceStatus.PRESENT }],
    });

    // 2nd recording on the same day: LATE
    await recordDailyAttendance(teacherAUser, {
      schoolClassId: class5AId,
      programmeId: primaryProgrammeId,
      academicSessionId,
      academicTermId,
      date: testDate,
      items: [{ studentId: student1Id, status: AttendanceStatus.LATE, remarks: 'Updated to late' }],
    });

    // Verify exactly ONE record exists for student on this day
    const allRecords = await prisma.attendanceRecord.findMany({
      where: {
        studentId: student1Id,
        schoolClassId: class5AId,
      },
    });
    expect(allRecords).toHaveLength(1);
    expect(allRecords[0].status).toBe(AttendanceStatus.LATE);
  });

  it('rejects attendance for a student not enrolled in the target class', async () => {
    const today = '2026-10-17';
    await expect(
      recordDailyAttendance(teacherAUser, {
        schoolClassId: class5AId,
        programmeId: primaryProgrammeId,
        academicSessionId,
        academicTermId,
        date: today,
        items: [
          {
            studentId: student2Id, // student2 is enrolled in Class 5B, not 5A
            status: AttendanceStatus.PRESENT,
          },
        ],
      })
    ).rejects.toThrow(/is not actively enrolled/);
  });

  // 3. Assessment Lifecycle & Immutability
  it('enforces complete assessment lifecycle: DRAFT -> SUBMITTED -> FINALIZED -> REOPEN', async () => {
    // A. Teacher creates DRAFT assessment
    const assessment = await createAssessment(teacherAUser, {
      title: 'Math Continuous Assessment 1',
      type: AssessmentType.CONTINUOUS_ASSESSMENT,
      programmeId: primaryProgrammeId,
      schoolClassId: class5AId,
      subjectId: subjectMathId,
      academicSessionId,
      academicTermId,
      gradingScaleId,
      maxScore: 40,
      weightPercentage: 20,
    });
    expect(assessment.status).toBe(AssessmentStatus.DRAFT);

    // B. Teacher updates scores while in DRAFT
    await updateAssessmentScores(teacherAUser, {
      assessmentId: assessment.id,
      scores: [
        {
          studentId: student1Id,
          rawScore: 36,
          scoreStatus: AssessmentScoreStatus.SCORED,
        },
      ],
    });

    const score = await prisma.assessmentScore.findFirstOrThrow({
      where: { assessmentId: assessment.id, studentId: student1Id },
    });
    expect(Number(score.rawScore)).toBe(36);
    expect(score.grade).toBe('A');

    // C. Teacher submits assessment
    const submitted = await submitAssessment(teacherAUser, assessment.id);
    expect(submitted.status).toBe(AssessmentStatus.SUBMITTED);

    // D. Teacher attempts to edit scores on SUBMITTED assessment -> REJECTED
    await expect(
      updateAssessmentScores(teacherAUser, {
        assessmentId: assessment.id,
        scores: [
          {
            studentId: student1Id,
            rawScore: 20,
            scoreStatus: AssessmentScoreStatus.SCORED,
          },
        ],
      })
    ).rejects.toThrow(/Cannot edit scores: Assessment is in 'SUBMITTED' status/);

    // E. Admin finalizes assessment
    const finalized = await finalizeAssessment(adminUser, assessment.id);
    expect(finalized.status).toBe(AssessmentStatus.FINALIZED);

    // F. Teacher attempts to edit FINALIZED assessment -> REJECTED
    await expect(
      updateAssessmentScores(teacherAUser, {
        assessmentId: assessment.id,
        scores: [
          {
            studentId: student1Id,
            rawScore: 25,
            scoreStatus: AssessmentScoreStatus.SCORED,
          },
        ],
      })
    ).rejects.toThrow(/Cannot edit scores: Assessment is in 'FINALIZED' status/);

    // G. Admin reopens assessment with mandatory justification
    const reopened = await reopenAssessment(
      adminUser,
      assessment.id,
      'Approved administrative review of marking discrepancy'
    );
    expect(reopened.status).toBe(AssessmentStatus.DRAFT);

    // Check AuditLog entry for reopening
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'ASSESSMENT_REOPENED',
        entityId: assessment.id,
      },
    });
    expect(audit).not.toBeNull();
    expect(audit?.newValues).toMatchObject({
      justification: 'Approved administrative review of marking discrepancy',
    });
  });

  // 4. Medical Privacy Protection
  it('protects medical privacy by stripping clinical notes, bloodGroup, and genotype from teacher roster', async () => {
    const roster = await getTeacherClassRoster(teacherAUser.id, class5AId, primaryProgrammeId, academicSessionId);
    expect(roster).toHaveLength(1);

    const studentData = roster[0] as unknown as Record<string, unknown>;
    expect(studentData.firstName).toBe('Zaynab');
    // Sensitive medical fields MUST be undefined/stripped
    expect(studentData.bloodGroup).toBeUndefined();
    expect(studentData.genotype).toBeUndefined();
    expect(studentData.medicalNotes).toBeUndefined();
  });
});
