import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { Gender, StudentStatus, RoleCode, RelationshipType, ProgrammeCode } from '@prisma/client';
import { getStudentById, listStudents } from '@/lib/students/student_service';
import { SafeUser } from '@/lib/auth/service';

describe('Stage 6 — Unit: Sensitive Data Field-Level Visibility & Projections', () => {
  let studentId: string;
  let studentAdmissionNumber: string;
  let superAdminUser: SafeUser;
  let teacherUser: SafeUser;
  let parentUser: SafeUser;
  let accountantUser: SafeUser;
  let parentGuardianId: string;
  let teacherProfileId: string;
  let academicSessionId: string;
  let academicTermId: string;
  let programmeId: string;
  let schoolClassId: string;

  beforeEach(async () => {
    // 1. Academic Hierarchy
    const session = await prisma.academicSession.create({
      data: {
        name: `Sens-Sess-${Date.now()}`,
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

    const programme = await prisma.programme.findUniqueOrThrow({
      where: { code: ProgrammeCode.PRIMARY },
    });
    programmeId = programme.id;

    const schoolClass = await prisma.schoolClass.create({
      data: {
        programmeId: programme.id,
        code: `SENS-CLS-${Date.now()}`,
        name: `Grade 4A-${Date.now()}`,
        capacity: 30,
      },
    });
    schoolClassId = schoolClass.id;

    // 2. Create Student with sensitive fields
    const student = await prisma.student.create({
      data: {
        admissionNumber: `SENS-${Date.now()}`,
        firstName: 'Zainab',
        lastName: 'Umar',
        gender: Gender.FEMALE,
        dateOfBirth: new Date('2016-04-12'),
        currentStatus: StudentStatus.ACTIVE,
        bloodGroup: 'O+',
        genotype: 'AA',
        medicalNotes: 'CONFIDENTIAL: Mild asthma inhaler stored in clinic cabinet B.',
        allergies: 'Peanuts, Penicillin',
        medicalConditions: 'Mild Asthma',
        emergencyContactName: 'Umar Farouk',
        emergencyContactPhone: '+2348030000001',
        emergencyContactRelationship: 'Father',
      },
    });
    studentId = student.id;
    studentAdmissionNumber = student.admissionNumber;

    // 3. Enroll student in class
    await prisma.studentProgrammeEnrollment.create({
      data: {
        studentId: student.id,
        programmeId: programme.id,
        schoolClassId: schoolClass.id,
        academicSessionId: session.id,
        academicTermId: term.id,
        enrollmentStatus: 'ACTIVE',
        enrollmentType: 'MAIN_ACADEMIC',
      },
    });

    // 4. Create Roles if not existing
    const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.SUPER_ADMIN } });
    const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.TEACHER } });
    const parentRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.PARENT } });
    const accountantRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.ACCOUNTANT } });

    // 5. Create Super Admin User
    const superAdmin = await prisma.user.create({
      data: {
        email: `superadmin-${Date.now()}@example.com`,
        passwordHash: 'dummy-hash',
        status: 'ACTIVE',
      },
    });
    await prisma.userRole.create({ data: { userId: superAdmin.id, roleId: superAdminRole.id } });
    superAdminUser = {
      id: superAdmin.id,
      email: superAdmin.email,
      phoneNumber: null,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      createdAt: new Date(),
    };

    // 6. Create Teacher User and assign to Class
    const teacher = await prisma.user.create({
      data: {
        email: `teacher-${Date.now()}@example.com`,
        passwordHash: 'dummy-hash',
        status: 'ACTIVE',
      },
    });
    await prisma.userRole.create({ data: { userId: teacher.id, roleId: teacherRole.id } });
    const teacherProfile = await prisma.teacher.create({
      data: {
        userId: teacher.id,
        staffIdNumber: `TCH-${Date.now()}`,
        firstName: 'Mallam',
        lastName: 'Ahmed',
      },
    });
    teacherProfileId = teacherProfile.id;

    // Link teacher to the student's class via TeacherScope
    await prisma.teacherScope.create({
      data: {
        teacherId: teacherProfile.id,
        programmeId: programme.id,
        schoolClassId: schoolClass.id,
        academicSessionId: session.id,
        isFormTeacher: true,
      },
    });

    teacherUser = {
      id: teacher.id,
      email: teacher.email,
      phoneNumber: null,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      createdAt: new Date(),
      teacherId: teacherProfile.id,
    };

    // 7. Create Parent User and link to Student
    const parent = await prisma.user.create({
      data: {
        email: `parent-${Date.now()}@example.com`,
        passwordHash: 'dummy-hash',
        status: 'ACTIVE',
      },
    });
    await prisma.userRole.create({ data: { userId: parent.id, roleId: parentRole.id } });
    const guardian = await prisma.guardian.create({
      data: {
        userId: parent.id,
        firstName: 'Umar',
        lastName: 'Farouk',
        email: parent.email,
      },
    });
    parentGuardianId = guardian.id;

    await prisma.guardianStudentRelationship.create({
      data: {
        guardianId: guardian.id,
        studentId: student.id,
        relationshipType: RelationshipType.FATHER,
        isPrimaryContact: true,
        status: 'ACTIVE',
      },
    });

    parentUser = {
      id: parent.id,
      email: parent.email,
      phoneNumber: null,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      createdAt: new Date(),
      guardianId: guardian.id,
    };

    // 8. Create Accountant User
    const accountant = await prisma.user.create({
      data: {
        email: `accountant-${Date.now()}@example.com`,
        passwordHash: 'dummy-hash',
        status: 'ACTIVE',
      },
    });
    await prisma.userRole.create({ data: { userId: accountant.id, roleId: accountantRole.id } });
    accountantUser = {
      id: accountant.id,
      email: accountant.email,
      phoneNumber: null,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      createdAt: new Date(),
    };
  });

  afterEach(async () => {
    // Clean up
    await prisma.guardianStudentRelationship.deleteMany({ where: { studentId } });
    await prisma.teacherScope.deleteMany({ where: { teacherId: teacherProfileId } });
    await prisma.studentProgrammeEnrollment.deleteMany({ where: { studentId } });
    await prisma.invoiceItem.deleteMany({ where: { invoice: { studentId } } });
    await prisma.invoice.deleteMany({ where: { studentId } });
    await prisma.invoiceItem.deleteMany({ where: { invoice: { guardianId: parentGuardianId } } });
    await prisma.invoice.deleteMany({ where: { guardianId: parentGuardianId } });
    await prisma.student.deleteMany({ where: { id: studentId } });
    await prisma.guardian.deleteMany({ where: { id: parentGuardianId } });
    await prisma.teacher.deleteMany({ where: { id: teacherProfileId } });
    await prisma.userRole.deleteMany({
      where: {
        userId: { in: [superAdminUser.id, teacherUser.id, parentUser.id, accountantUser.id] },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [superAdminUser.id, teacherUser.id, parentUser.id, accountantUser.id] },
      },
    });
    await prisma.schoolClass.deleteMany({ where: { id: schoolClassId } });
    await prisma.academicTerm.deleteMany({ where: { id: academicTermId } });
    await prisma.academicSession.deleteMany({ where: { id: academicSessionId } });
    await prisma.academicSession.updateMany({
      where: { name: '2026/2027' },
      data: { isCurrent: true, status: 'ACTIVE' },
    });
  });

  it('Super Admin sees full medical profile, confidential clinic notes, and emergency contacts', async () => {
    const result = await getStudentById(superAdminUser, studentId);

    expect(result.id).toBe(studentId);
    expect(result.bloodGroup).toBe('O+');
    expect(result.genotype).toBe('AA');
    expect(result.medicalNotes).toBe('CONFIDENTIAL: Mild asthma inhaler stored in clinic cabinet B.');
    expect(result.allergies).toBe('Peanuts, Penicillin');
    expect(result.medicalConditions).toBe('Mild Asthma');
    expect(result.emergencyContactName).toBe('Umar Farouk');
    expect(result.emergencyContactPhone).toBe('+2348030000001');
  });

  it('Teacher sees classroom safety data (allergies, emergency contacts) but NEVER sees bloodGroup, genotype, or confidential notes', async () => {
    const result = await getStudentById(teacherUser, studentId, {
      academicSessionId,
      programmeId,
    });

    expect(result.id).toBe(studentId);
    expect(result.allergies).toBe('Peanuts, Penicillin');
    expect(result.medicalConditions).toBe('Mild Asthma');
    expect(result.emergencyContactName).toBe('Umar Farouk');
    expect(result.emergencyContactPhone).toBe('+2348030000001');

    // Strictly forbidden fields for teachers
    expect(result.bloodGroup).toBeUndefined();
    expect(result.genotype).toBeUndefined();
    expect(result.medicalNotes).toBeUndefined();
  });

  it('Parent sees medical profile and emergency contacts for their child, but NEVER sees internal administrative clinic notes', async () => {
    const result = await getStudentById(parentUser, studentId);

    expect(result.id).toBe(studentId);
    expect(result.bloodGroup).toBe('O+');
    expect(result.genotype).toBe('AA');
    expect(result.allergies).toBe('Peanuts, Penicillin');
    expect(result.medicalConditions).toBe('Mild Asthma');
    expect(result.emergencyContactName).toBe('Umar Farouk');

    // Private clinic notes are strictly administrative
    expect(result.medicalNotes).toBeUndefined();
  });

  it('Accountant sees student demographic data for billing, but has NO ACCESS to any medical or emergency contact fields', async () => {
    const result = await getStudentById(accountantUser, studentId);

    expect(result.id).toBe(studentId);
    expect(result.firstName).toBe('Zainab');
    expect(result.lastName).toBe('Umar');

    // NO medical or emergency fields for accountant
    expect(result.bloodGroup).toBeUndefined();
    expect(result.genotype).toBeUndefined();
    expect(result.medicalNotes).toBeUndefined();
    expect(result.allergies).toBeUndefined();
    expect(result.medicalConditions).toBeUndefined();
    expect(result.emergencyContactName).toBeUndefined();
    expect(result.emergencyContactPhone).toBeUndefined();
  });

  it('Generic listStudents queries NEVER project medical or emergency fields regardless of caller role', async () => {
    const listResult = await listStudents(superAdminUser, { search: studentAdmissionNumber });

    expect(listResult.students.length).toBeGreaterThanOrEqual(1);
    const item = listResult.students.find((s) => s.id === studentId)!;
    expect(item).toBeDefined();

    // Verify properties do not exist in the projected object
    expect('medicalNotes' in item).toBe(false);
    expect('bloodGroup' in item).toBe(false);
    expect('genotype' in item).toBe(false);
    expect('allergies' in item).toBe(false);
    expect('medicalConditions' in item).toBe(false);
    expect('emergencyContactName' in item).toBe(false);
    expect('emergencyContactPhone' in item).toBe(false);
  });
});
