import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { Gender, StudentStatus, RoleCode, EnrollmentType, EnrollmentStatus, ProgrammeCode } from '@prisma/client';
import { createStudent, updateStudent, transitionStudentStatus } from '@/lib/students/student_service';
import {
  enrollStudentInProgramme,
  withdrawStudentFromProgramme,
  progressStudentEnrollment,
  getStudentEnrollments,
} from '@/lib/students/enrollment_service';
import { SafeUser } from '@/lib/auth/service';

describe('Stage 6 — Integration: Student Lifecycle & Multi-Programme Enrollments', () => {
  let adminUser: SafeUser;
  let academicSession1Id: string;
  let academicSession2Id: string;
  let term1Id: string;
  let term2Session2Id: string;
  let primaryProgId: string;
  let tahfeezProgId: string;
  let primaryClass1Id: string;
  let primaryClass2Id: string;
  let tahfeezClassId: string;
  const createdStudentIds: string[] = [];

  beforeEach(async () => {
    // 1. Setup Academic Structure
    const session1 = await prisma.academicSession.create({
      data: {
        name: `Life-Sess-1-${Date.now()}`,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-07-31'),
        isCurrent: true,
      },
    });
    academicSession1Id = session1.id;

    const term1 = await prisma.academicTerm.create({
      data: {
        academicSessionId: session1.id,
        termCode: 'FIRST',
        name: 'First Term',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-12-15'),
        isCurrent: true,
      },
    });
    term1Id = term1.id;

    const session2 = await prisma.academicSession.create({
      data: {
        name: `Life-Sess-2-${Date.now()}`,
        startDate: new Date('2027-09-01'),
        endDate: new Date('2028-07-31'),
        isCurrent: false,
      },
    });
    academicSession2Id = session2.id;

    const term2Session2 = await prisma.academicTerm.create({
      data: {
        academicSessionId: session2.id,
        termCode: 'FIRST',
        name: 'First Term (Next Session)',
        startDate: new Date('2027-09-01'),
        endDate: new Date('2027-12-15'),
        isCurrent: false,
      },
    });
    term2Session2Id = term2Session2.id;

    // 2. Lookup Programmes: 1 Main Academic (Primary), 1 Additional (Tahfeez)
    const primaryProg = await prisma.programme.findUniqueOrThrow({
      where: { code: ProgrammeCode.PRIMARY },
    });
    primaryProgId = primaryProg.id;

    const tahfeezProg = await prisma.programme.findUniqueOrThrow({
      where: { code: ProgrammeCode.TAHFEEZ },
    });
    tahfeezProgId = tahfeezProg.id;

    const class1 = await prisma.schoolClass.create({
      data: {
        programmeId: primaryProg.id,
        code: `LIFE-P3-${Date.now()}`,
        name: `Primary 3A-${Date.now()}`,
        capacity: 30,
      },
    });
    primaryClass1Id = class1.id;

    const class2 = await prisma.schoolClass.create({
      data: {
        programmeId: primaryProg.id,
        code: `LIFE-P4-${Date.now()}`,
        name: `Primary 4A-${Date.now()}`,
        capacity: 30,
      },
    });
    primaryClass2Id = class2.id;

    const tahfeezClass = await prisma.schoolClass.create({
      data: {
        programmeId: tahfeezProg.id,
        code: `LIFE-TAH-${Date.now()}`,
        name: `Tahfeez Halaqah A-${Date.now()}`,
        capacity: 30,
      },
    });
    tahfeezClassId = tahfeezClass.id;

    // 3. Setup Admin User with Super Admin role
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.SUPER_ADMIN } });
    const user = await prisma.user.create({
      data: {
        email: `student-admin-${Date.now()}@example.com`,
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
  });

  afterEach(async () => {
    for (const sid of createdStudentIds) {
      await prisma.studentProgrammeEnrollment.deleteMany({ where: { studentId: sid } });
      await prisma.guardianStudentRelationship.deleteMany({ where: { studentId: sid } });
      await prisma.student.deleteMany({ where: { id: sid } });
    }
    await prisma.userRole.deleteMany({ where: { userId: adminUser.id } });
    await prisma.user.deleteMany({ where: { id: adminUser.id } });
    await prisma.schoolClass.deleteMany({ where: { id: { in: [primaryClass1Id, primaryClass2Id, tahfeezClassId] } } });
    await prisma.academicTerm.deleteMany({ where: { id: { in: [term1Id, term2Session2Id] } } });
    await prisma.academicSession.deleteMany({ where: { id: { in: [academicSession1Id, academicSession2Id] } } });
    await prisma.academicSession.updateMany({
      where: { name: '2026/2027' },
      data: { isCurrent: true, status: 'ACTIVE' },
    });
  });

  it('creates student with server-generated admission number, and admission number remains immutable', async () => {
    const { student } = await createStudent(adminUser, {
      firstName: 'Fatima',
      lastName: 'Danjuma',
      gender: Gender.FEMALE,
      dateOfBirth: new Date('2017-03-22'),
    });
    createdStudentIds.push(student.id);

    expect(student.admissionNumber).toMatch(/^SA-\d{4}-\d+$/);
    expect(student.currentStatus).toBe(StudentStatus.ACTIVE);

    // Update student demographics
    const updated = await updateStudent(adminUser, student.id, {
      firstName: 'Fatima-Zahra',
      lastName: 'Danjuma',
    });

    expect(updated.firstName).toBe('Fatima-Zahra');
    expect(updated.admissionNumber).toBe(student.admissionNumber); // Unchanged!
  });

  it('supports concurrent multi-programme enrollments (Primary + Tahfeez)', async () => {
    const { student } = await createStudent(adminUser, {
      firstName: 'Bilal',
      lastName: 'Ibrahim',
      gender: Gender.MALE,
      dateOfBirth: new Date('2015-08-10'),
    });
    createdStudentIds.push(student.id);

    // 1. Enroll in Primary
    const primaryEnrollment = await enrollStudentInProgramme(adminUser, {
      studentId: student.id,
      programmeId: primaryProgId,
      schoolClassId: primaryClass1Id,
      academicSessionId: academicSession1Id,
      academicTermId: term1Id,
    });
    expect(primaryEnrollment.enrollmentType).toBe(EnrollmentType.MAIN_ACADEMIC);
    expect(primaryEnrollment.enrollmentStatus).toBe(EnrollmentStatus.ACTIVE);

    // 2. Simultaneously enroll in Tahfeez
    const tahfeezEnrollment = await enrollStudentInProgramme(adminUser, {
      studentId: student.id,
      programmeId: tahfeezProgId,
      schoolClassId: tahfeezClassId,
      academicSessionId: academicSession1Id,
      academicTermId: term1Id,
    });
    expect(tahfeezEnrollment.enrollmentType).toBe(EnrollmentType.ADDITIONAL_PROGRAMME);
    expect(tahfeezEnrollment.enrollmentStatus).toBe(EnrollmentStatus.ACTIVE);

    // Check active enrollments
    const activeEnrollments = await getStudentEnrollments(adminUser, student.id);
    expect(activeEnrollments.length).toBe(2);
  });

  it('enforces at most ONE MAIN_ACADEMIC enrollment per term/session', async () => {
    const { student } = await createStudent(adminUser, {
      firstName: 'Musa',
      lastName: 'Aliyu',
      gender: Gender.MALE,
      dateOfBirth: new Date('2014-11-05'),
    });
    createdStudentIds.push(student.id);

    // First Main Academic
    await enrollStudentInProgramme(adminUser, {
      studentId: student.id,
      programmeId: primaryProgId,
      schoolClassId: primaryClass1Id,
      academicSessionId: academicSession1Id,
      academicTermId: term1Id,
    });

    // Lookup 2nd Main Academic programme (Nursery)
    const nurseryProg = await prisma.programme.findUniqueOrThrow({
      where: { code: ProgrammeCode.NURSERY },
    });
    const nurseryClass = await prisma.schoolClass.create({
      data: {
        programmeId: nurseryProg.id,
        code: `LIFE-NUR-${Date.now()}`,
        name: `Nursery 2A-${Date.now()}`,
        capacity: 30,
      },
    });

    // Attempting a second Main Academic enrollment in the same term must fail
    await expect(
      enrollStudentInProgramme(adminUser, {
        studentId: student.id,
        programmeId: nurseryProg.id,
        schoolClassId: nurseryClass.id,
        academicSessionId: academicSession1Id,
        academicTermId: term1Id,
      })
    ).rejects.toThrow('already actively enrolled in main academic programme');

    // Clean up extra class
    await prisma.schoolClass.delete({ where: { id: nurseryClass.id } });
  });

  it('progresses enrollment across sessions/classes while preserving historical lineage', async () => {
    const { student } = await createStudent(adminUser, {
      firstName: 'Khadija',
      lastName: 'Usman',
      gender: Gender.FEMALE,
      dateOfBirth: new Date('2016-01-20'),
    });
    createdStudentIds.push(student.id);

    // Initial enrollment in Primary 3A
    const initialEnrollment = await enrollStudentInProgramme(adminUser, {
      studentId: student.id,
      programmeId: primaryProgId,
      schoolClassId: primaryClass1Id,
      academicSessionId: academicSession1Id,
      academicTermId: term1Id,
    });

    // Advance/progress to Primary 4A in Session 2
    const nextEnrollment = await progressStudentEnrollment(adminUser, {
      currentEnrollmentId: initialEnrollment.id,
      nextSessionId: academicSession2Id,
      nextTermId: term2Session2Id,
      nextClassId: primaryClass2Id,
    });

    expect(nextEnrollment.enrollmentStatus).toBe(EnrollmentStatus.ACTIVE);
    expect(nextEnrollment.schoolClassId).toBe(primaryClass2Id);

    // Verify historical inquiry shows both
    const allEnrollments = await getStudentEnrollments(adminUser, student.id, {
      includeHistorical: true,
    });

    expect(allEnrollments.length).toBe(2);
    const completedRecord = allEnrollments.find((e) => e.id === initialEnrollment.id)!;
    const activeRecord = allEnrollments.find((e) => e.id === nextEnrollment.id)!;

    expect(completedRecord.enrollmentStatus).toBe(EnrollmentStatus.COMPLETED);
    expect(activeRecord.enrollmentStatus).toBe(EnrollmentStatus.ACTIVE);
  });

  it('keeps student lifecycle status decoupled from individual programme status', async () => {
    const { student } = await createStudent(adminUser, {
      firstName: 'Usman',
      lastName: 'Gwadabe',
      gender: Gender.MALE,
      dateOfBirth: new Date('2015-06-18'),
    });
    createdStudentIds.push(student.id);

    // Enroll in Tahfeez
    const tahfeezEnrollment = await enrollStudentInProgramme(adminUser, {
      studentId: student.id,
      programmeId: tahfeezProgId,
      schoolClassId: tahfeezClassId,
      academicSessionId: academicSession1Id,
      academicTermId: term1Id,
    });

    // Withdraw from Tahfeez
    const withdrawn = await withdrawStudentFromProgramme(
      adminUser,
      tahfeezEnrollment.id,
      'Relocating to another branch for Tahfeez'
    );
    expect(withdrawn.enrollmentStatus).toBe(EnrollmentStatus.WITHDRAWN);

    // Verify overall student status is STILL ACTIVE!
    const refreshedStudent = await prisma.student.findUniqueOrThrow({
      where: { id: student.id },
    });
    expect(refreshedStudent.currentStatus).toBe(StudentStatus.ACTIVE);

    // Explicitly transition student lifecycle status to INACTIVE or ARCHIVED
    const archivedStudent = await transitionStudentStatus(
      adminUser,
      student.id,
      StudentStatus.ARCHIVED,
      'Graduated and archived records'
    );
    expect(archivedStudent.currentStatus).toBe(StudentStatus.ARCHIVED);
  });
});
