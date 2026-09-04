import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { Gender, StudentStatus, RoleCode, RelationshipType, ProgrammeCode } from '@prisma/client';
import { createStudent, getStudentById } from '@/lib/students/student_service';
import { SafeUser } from '@/lib/auth/service';

describe('Stage 6 — Integration: Student Authorization & Scope Boundary Tests', () => {
  let adminUser: SafeUser;
  let unauthorizedUser: SafeUser;
  let parentUser: SafeUser;
  let teacherUser: SafeUser;
  let ownChildId: string;
  let otherChildId: string;
  let parentGuardianId: string;
  let teacherProfileId: string;
  let schoolClassId: string;
  let otherClassId: string;
  let programmeId: string;
  let academicSessionId: string;
  let academicTermId: string;

  beforeEach(async () => {
    // 1. Setup Academic Hierarchy
    const session = await prisma.academicSession.create({
      data: {
        name: `Auth-Sess-${Date.now()}`,
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
        code: `AUTH-5A-${Date.now()}`,
        name: `Class 5A-${Date.now()}`,
        capacity: 30,
      },
    });
    schoolClassId = schoolClass.id;

    const otherClass = await prisma.schoolClass.create({
      data: {
        programmeId: programme.id,
        code: `AUTH-5B-${Date.now()}`,
        name: `Class 5B-${Date.now()}`,
        capacity: 30,
      },
    });
    otherClassId = otherClass.id;

    // 2. Setup Students
    const ownChild = await prisma.student.create({
      data: {
        admissionNumber: `OWN-${Date.now()}`,
        firstName: 'Salma',
        lastName: 'Bello',
        gender: Gender.FEMALE,
        dateOfBirth: new Date('2015-03-01'),
        currentStatus: StudentStatus.ACTIVE,
      },
    });
    ownChildId = ownChild.id;

    const otherChild = await prisma.student.create({
      data: {
        admissionNumber: `OTHER-${Date.now()}`,
        firstName: 'Tariq',
        lastName: 'Aliyu',
        gender: Gender.MALE,
        dateOfBirth: new Date('2015-04-01'),
        currentStatus: StudentStatus.ACTIVE,
      },
    });
    otherChildId = otherChild.id;

    // Enroll ownChild in schoolClassId (assigned to teacher)
    await prisma.studentProgrammeEnrollment.create({
      data: {
        studentId: ownChild.id,
        programmeId: programme.id,
        schoolClassId: schoolClass.id,
        academicSessionId: session.id,
        academicTermId: term.id,
        enrollmentStatus: 'ACTIVE',
        enrollmentType: 'MAIN_ACADEMIC',
      },
    });

    // Enroll otherChild in otherClassId (NOT assigned to teacher)
    await prisma.studentProgrammeEnrollment.create({
      data: {
        studentId: otherChild.id,
        programmeId: programme.id,
        schoolClassId: otherClass.id,
        academicSessionId: session.id,
        academicTermId: term.id,
        enrollmentStatus: 'ACTIVE',
        enrollmentType: 'MAIN_ACADEMIC',
      },
    });

    // 3. Setup Roles
    const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.SUPER_ADMIN } });
    const parentRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.PARENT } });
    const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.TEACHER } });

    // 4. Setup Admin User
    const admin = await prisma.user.create({
      data: { email: `admin-${Date.now()}@example.com`, passwordHash: 'dummy-hash', status: 'ACTIVE' },
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

    // 5. Setup Unauthorized User (No roles granted)
    const viewer = await prisma.user.create({
      data: { email: `viewer-${Date.now()}@example.com`, passwordHash: 'dummy-hash', status: 'ACTIVE' },
    });
    unauthorizedUser = {
      id: viewer.id,
      email: viewer.email,
      phoneNumber: null,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      createdAt: new Date(),
    };

    // 6. Setup Parent User linked ONLY to ownChild
    const parent = await prisma.user.create({
      data: { email: `parent-auth-${Date.now()}@example.com`, passwordHash: 'dummy-hash', status: 'ACTIVE' },
    });
    await prisma.userRole.create({ data: { userId: parent.id, roleId: parentRole.id } });
    const guardian = await prisma.guardian.create({
      data: {
        userId: parent.id,
        firstName: 'Parent',
        lastName: 'Bello',
        email: parent.email,
      },
    });
    parentGuardianId = guardian.id;

    await prisma.guardianStudentRelationship.create({
      data: {
        guardianId: guardian.id,
        studentId: ownChild.id,
        relationshipType: RelationshipType.MOTHER,
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

    // 7. Setup Teacher User assigned ONLY to Class 5A
    const teacher = await prisma.user.create({
      data: { email: `teacher-auth-${Date.now()}@example.com`, passwordHash: 'dummy-hash', status: 'ACTIVE' },
    });
    await prisma.userRole.create({ data: { userId: teacher.id, roleId: teacherRole.id } });
    const teacherProfile = await prisma.teacher.create({
      data: {
        userId: teacher.id,
        staffIdNumber: `TCH-AUTH-${Date.now()}`,
        firstName: 'Ustaz',
        lastName: 'Bello',
      },
    });
    teacherProfileId = teacherProfile.id;

    // Link teacher to Class 5A via TeacherScope
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
  });

  afterEach(async () => {
    await prisma.guardianStudentRelationship.deleteMany({ where: { studentId: { in: [ownChildId, otherChildId] } } });
    await prisma.teacherScope.deleteMany({ where: { teacherId: teacherProfileId } });
    await prisma.studentProgrammeEnrollment.deleteMany({ where: { studentId: { in: [ownChildId, otherChildId] } } });
    await prisma.invoiceItem.deleteMany({ where: { invoice: { studentId: { in: [ownChildId, otherChildId] } } } });
    await prisma.invoice.deleteMany({ where: { studentId: { in: [ownChildId, otherChildId] } } });
    await prisma.invoiceItem.deleteMany({ where: { invoice: { guardianId: parentGuardianId } } });
    await prisma.invoice.deleteMany({ where: { guardianId: parentGuardianId } });
    await prisma.student.deleteMany({ where: { id: { in: [ownChildId, otherChildId] } } });
    await prisma.guardian.deleteMany({ where: { id: parentGuardianId } });
    await prisma.teacher.deleteMany({ where: { id: teacherProfileId } });
    await prisma.userRole.deleteMany({
      where: { userId: { in: [adminUser.id, unauthorizedUser.id, parentUser.id, teacherUser.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [adminUser.id, unauthorizedUser.id, parentUser.id, teacherUser.id] } },
    });
    await prisma.schoolClass.deleteMany({ where: { id: { in: [schoolClassId, otherClassId] } } });
    await prisma.academicTerm.deleteMany({ where: { id: academicTermId } });
    await prisma.academicSession.deleteMany({ where: { id: academicSessionId } });
  });

  it('rejects student creation by a user without STUDENT_CREATE permission', async () => {
    await expect(
      createStudent(unauthorizedUser, {
        firstName: 'Kabir',
        lastName: 'Ibrahim',
        gender: Gender.MALE,
        dateOfBirth: new Date('2016-05-10'),
      })
    ).rejects.toThrow("Missing required permission 'students:create'");
  });

  it('allows parent to view their own child, but strictly rejects accessing other students (403)', async () => {
    // 1. Parent accesses own child -> Success
    const ownStudent = await getStudentById(parentUser, ownChildId);
    expect(ownStudent.id).toBe(ownChildId);
    expect(ownStudent.firstName).toBe('Salma');

    // 2. Parent attempts to access otherChild -> 403 Forbidden
    await expect(
      getStudentById(parentUser, otherChildId)
    ).rejects.toThrow('Access denied: You are not authorized to view or manage records for this student.');
  });

  it('allows teacher to view student in assigned class, but rejects student in unassigned class', async () => {
    // 1. Teacher views student in assigned Class 5A -> Success
    const inScopeStudent = await getStudentById(teacherUser, ownChildId, {
      academicSessionId,
      programmeId,
    });
    expect(inScopeStudent.id).toBe(ownChildId);

    // 2. Teacher attempts to view student in Class 5B (not assigned) -> 403 Forbidden
    await expect(
      getStudentById(teacherUser, otherChildId, {
        academicSessionId,
        programmeId,
      })
    ).rejects.toThrow('outside teacher assigned scope');
  });
});
