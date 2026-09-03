import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  RoleCode,
  UserStatus,
  ProgrammeCode,
  EnrollmentType,
  EnrollmentStatus,
  RelationshipType,
  RelationshipStatus,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  assertParentOwnsStudent,
  getParentAccessibleStudentIds,
  assertTeacherScope,
  assertTeacherStudentScope,
} from '@/lib/auth/scopes';
import { assignTeacherScope } from '@/lib/auth/role_service';
import { hashPassword } from '@/lib/auth/password';

describe('Integration Tests: Scoping Engine, Multi-Programme Isolation & Parameter Tampering Guards', () => {
  let superAdminUser: { id: string };
  let academicSession: { id: string };
  let otherAcademicSession: { id: string };

  // Programmes
  let primaryProg: { id: string };
  let tahfeezProg: { id: string };

  // Classes
  let primary4Class: { id: string };
  let primary5Class: { id: string };
  let tahfeezClass: { id: string };

  // Subjects
  let mathSubject: { id: string };
  let englishSubject: { id: string };
  let quranSubject: { id: string };

  // Students
  let studentAhmed: { id: string };
  let studentFatima: { id: string };
  let studentUnrelated: { id: string };

  // Parent & Teacher Users
  let parentUser: { id: string };
  let parentGuardian: { id: string };
  let teacherUserA: { id: string };
  let teacherProfileA: { id: string };

  beforeAll(async () => {
    // 0. Clean up test records from prior runs to ensure test idempotency
    await prisma.teacherScope.deleteMany({
      where: { teacher: { user: { email: 'scope.teacher.a@swanford.internal' } } },
    });
    await prisma.teacher.deleteMany({
      where: { user: { email: 'scope.teacher.a@swanford.internal' } },
    });
    await prisma.guardianStudentRelationship.deleteMany({
      where: { guardian: { email: 'scope.parent.sani@example.com' } },
    });
    await prisma.guardian.deleteMany({
      where: { email: 'scope.parent.sani@example.com' },
    });
    await prisma.studentProgrammeEnrollment.deleteMany({
      where: {
        student: { admissionNumber: { in: ['SA-2026-9001', 'SA-2026-9002', 'SA-2026-9003'] } },
      },
    });
    await prisma.student.deleteMany({
      where: { admissionNumber: { in: ['SA-2026-9001', 'SA-2026-9002', 'SA-2026-9003'] } },
    });
    await prisma.userRole.deleteMany({
      where: {
        user: {
          email: {
            in: [
              'scope.superadmin@swanford.internal',
              'scope.parent.sani@example.com',
              'scope.teacher.a@swanford.internal',
            ],
          },
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'scope.superadmin@swanford.internal',
            'scope.parent.sani@example.com',
            'scope.teacher.a@swanford.internal',
          ],
        },
      },
    });

    const passwordHash = await hashPassword('ScopeTestPass@2026!');

    // 1. Super Admin for administration
    const superAdminRole = await prisma.role.findUniqueOrThrow({
      where: { code: RoleCode.SUPER_ADMIN },
    });
    superAdminUser = await prisma.user.create({
      data: {
        email: 'scope.superadmin@swanford.internal',
        passwordHash,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: superAdminRole.id } },
      },
    });

    // 2. Academic Sessions & Terms
    academicSession = await prisma.academicSession.findFirstOrThrow({
      where: { isCurrent: true },
    });

    const academicTerm = await prisma.academicTerm.findFirstOrThrow({
      where: { academicSessionId: academicSession.id },
    });

    otherAcademicSession = await prisma.academicSession.upsert({
      where: { name: '2025/2026' },
      update: {},
      create: {
        name: '2025/2026',
        startDate: new Date('2025-09-01'),
        endDate: new Date('2026-07-31'),
        isCurrent: false,
      },
    });

    // 3. Programmes
    primaryProg = await prisma.programme.findUniqueOrThrow({
      where: { code: ProgrammeCode.PRIMARY },
    });
    tahfeezProg = await prisma.programme.findUniqueOrThrow({
      where: { code: ProgrammeCode.TAHFEEZ },
    });

    // 4. Classes
    primary4Class = await prisma.schoolClass.upsert({
      where: { code: 'PRI_4_SCOPE' },
      update: {},
      create: {
        programmeId: primaryProg.id,
        code: 'PRI_4_SCOPE',
        name: 'Primary 4 Scope',
        capacity: 30,
      },
    });

    primary5Class = await prisma.schoolClass.upsert({
      where: { code: 'PRI_5_SCOPE' },
      update: {},
      create: {
        programmeId: primaryProg.id,
        code: 'PRI_5_SCOPE',
        name: 'Primary 5 Scope',
        capacity: 30,
      },
    });

    tahfeezClass = await prisma.schoolClass.upsert({
      where: { code: 'TAH_A_SCOPE' },
      update: {},
      create: {
        programmeId: tahfeezProg.id,
        code: 'TAH_A_SCOPE',
        name: 'Tahfeez Class A Scope',
        capacity: 20,
      },
    });

    // 5. Subjects
    mathSubject = await prisma.subject.upsert({
      where: { code: 'MATH_SCOPE' },
      update: {},
      create: {
        programmeId: primaryProg.id,
        code: 'MATH_SCOPE',
        name: 'Mathematics',
      },
    });

    englishSubject = await prisma.subject.upsert({
      where: { code: 'ENG_SCOPE' },
      update: {},
      create: {
        programmeId: primaryProg.id,
        code: 'ENG_SCOPE',
        name: 'English',
      },
    });

    quranSubject = await prisma.subject.upsert({
      where: { code: 'QUR_SCOPE' },
      update: {},
      create: {
        programmeId: tahfeezProg.id,
        code: 'QUR_SCOPE',
        name: 'Quran Memorization',
      },
    });

    // 6. Students
    // Ahmed: MULTI-PROGRAMME (Primary 4 AND Tahfeez)
    studentAhmed = await prisma.student.create({
      data: {
        admissionNumber: 'SA-2026-9001',
        firstName: 'Ahmed',
        lastName: 'Sani',
        gender: 'MALE',
        dateOfBirth: new Date('2016-03-15'),
        currentStatus: 'ACTIVE',
        programmeEnrollments: {
          create: [
            {
              programmeId: primaryProg.id,
              schoolClassId: primary4Class.id,
              academicSessionId: academicSession.id,
              academicTermId: academicTerm.id,
              enrollmentType: EnrollmentType.MAIN_ACADEMIC,
              enrollmentStatus: EnrollmentStatus.ACTIVE,
            },
            {
              programmeId: tahfeezProg.id,
              schoolClassId: tahfeezClass.id,
              academicSessionId: academicSession.id,
              academicTermId: academicTerm.id,
              enrollmentType: EnrollmentType.ADDITIONAL_PROGRAMME,
              enrollmentStatus: EnrollmentStatus.ACTIVE,
            },
          ],
        },
      },
    });

    // Fatima: Sister of Ahmed (Primary 4 only)
    studentFatima = await prisma.student.create({
      data: {
        admissionNumber: 'SA-2026-9002',
        firstName: 'Fatima',
        lastName: 'Sani',
        gender: 'FEMALE',
        dateOfBirth: new Date('2018-06-20'),
        currentStatus: 'ACTIVE',
        programmeEnrollments: {
          create: [
            {
              programmeId: primaryProg.id,
              schoolClassId: primary4Class.id,
              academicSessionId: academicSession.id,
              academicTermId: academicTerm.id,
              enrollmentType: EnrollmentType.MAIN_ACADEMIC,
              enrollmentStatus: EnrollmentStatus.ACTIVE,
            },
          ],
        },
      },
    });

    // Unrelated Student (Primary 5 only)
    studentUnrelated = await prisma.student.create({
      data: {
        admissionNumber: 'SA-2026-9003',
        firstName: 'Zainab',
        lastName: 'Aliyu',
        gender: 'FEMALE',
        dateOfBirth: new Date('2015-01-10'),
        currentStatus: 'ACTIVE',
        programmeEnrollments: {
          create: [
            {
              programmeId: primaryProg.id,
              schoolClassId: primary5Class.id,
              academicSessionId: academicSession.id,
              academicTermId: academicTerm.id,
              enrollmentType: EnrollmentType.MAIN_ACADEMIC,
              enrollmentStatus: EnrollmentStatus.ACTIVE,
            },
          ],
        },
      },
    });

    // 7. Parent User: Muhammad Sani (Father of Ahmed and Fatima)
    const parentRole = await prisma.role.findUniqueOrThrow({
      where: { code: RoleCode.PARENT },
    });
    parentUser = await prisma.user.create({
      data: {
        email: 'scope.parent.sani@example.com',
        passwordHash,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: parentRole.id } },
      },
    });
    parentGuardian = await prisma.guardian.create({
      data: {
        userId: parentUser.id,
        firstName: 'Muhammad',
        lastName: 'Sani',
        email: 'scope.parent.sani@example.com',
        phonePrimary: '08012345678',
        relationships: {
          create: [
            {
              studentId: studentAhmed.id,
              relationshipType: RelationshipType.FATHER,
              status: RelationshipStatus.ACTIVE,
            },
            {
              studentId: studentFatima.id,
              relationshipType: RelationshipType.FATHER,
              status: RelationshipStatus.ACTIVE,
            },
          ],
        },
      },
    });

    // 8. Teacher User A: Scoped strictly to Primary / Primary 4 / Mathematics
    const teacherRole = await prisma.role.findUniqueOrThrow({
      where: { code: RoleCode.TEACHER },
    });
    teacherUserA = await prisma.user.create({
      data: {
        email: 'scope.teacher.a@swanford.internal',
        passwordHash,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: teacherRole.id } },
      },
    });
    teacherProfileA = await prisma.teacher.create({
      data: {
        userId: teacherUserA.id,
        staffIdNumber: 'STAFF_SCOPE_A',
        firstName: 'Usman',
        lastName: 'Bello',
      },
    });

    // Assign Teacher A Scope: Primary -> Primary 4 -> Mathematics
    await assignTeacherScope(superAdminUser.id, {
      teacherId: teacherProfileA.id,
      academicSessionId: academicSession.id,
      programmeId: primaryProg.id,
      schoolClassId: primary4Class.id,
      subjectId: mathSubject.id,
    });
  });

  afterAll(async () => {
    // Clean up created entities safely
    if (superAdminUser?.id) {
      await prisma.auditLog.deleteMany({
        where: { userId: superAdminUser.id },
      });
    }
    if (teacherProfileA?.id) {
      await prisma.teacherScope.deleteMany({
        where: { teacherId: teacherProfileA.id },
      });
      await prisma.teacher.deleteMany({
        where: { id: teacherProfileA.id },
      });
    }
    if (parentGuardian?.id) {
      await prisma.guardianStudentRelationship.deleteMany({
        where: { guardianId: parentGuardian.id },
      });
      await prisma.guardian.deleteMany({
        where: { id: parentGuardian.id },
      });
    }
    const studentIds = [studentAhmed?.id, studentFatima?.id, studentUnrelated?.id].filter(Boolean) as string[];
    if (studentIds.length > 0) {
      await prisma.studentProgrammeEnrollment.deleteMany({
        where: { studentId: { in: studentIds } },
      });
      await prisma.student.deleteMany({
        where: { id: { in: studentIds } },
      });
    }
    const userIds = [superAdminUser?.id, parentUser?.id, teacherUserA?.id].filter(Boolean) as string[];
    if (userIds.length > 0) {
      await prisma.userRole.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }
  });

  // ---------------------------------------------------------------------------
  // PARENT SCOPE TESTS
  // ---------------------------------------------------------------------------
  describe('Parent Scope & Family Boundary Enforcement', () => {
    it('allows parent to access first linked child (Ahmed)', async () => {
      const rel = await assertParentOwnsStudent(parentUser.id, studentAhmed.id);
      expect(rel).toBeDefined();
      expect(rel.studentId).toBe(studentAhmed.id);
      expect(rel.status).toBe(RelationshipStatus.ACTIVE);
    });

    it('allows parent to access second linked child (Fatima)', async () => {
      const rel = await assertParentOwnsStudent(parentUser.id, studentFatima.id);
      expect(rel).toBeDefined();
      expect(rel.studentId).toBe(studentFatima.id);
    });

    it('returns exactly the list of linked student IDs for the parent', async () => {
      const ids = await getParentAccessibleStudentIds(parentUser.id);
      expect(ids).toHaveLength(2);
      expect(ids).toContain(studentAhmed.id);
      expect(ids).toContain(studentFatima.id);
      expect(ids).not.toContain(studentUnrelated.id);
    });

    it('denies parent access when client tampers with studentId to access an unrelated student', async () => {
      // Malicious attempt by Parent Sani to access Zainab Aliyu's records
      await expect(
        assertParentOwnsStudent(parentUser.id, studentUnrelated.id)
      ).rejects.toMatchObject({
        code: 'STUDENT_ACCESS_DENIED',
        statusCode: 403,
      });
    });

    it('denies parent access when client sends a completely random non-existent studentId', async () => {
      await expect(
        assertParentOwnsStudent(parentUser.id, '00000000-0000-0000-0000-000000000000')
      ).rejects.toMatchObject({
        code: 'STUDENT_ACCESS_DENIED',
        statusCode: 403,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // TEACHER SCOPE & MANDATORY MULTI-PROGRAMME ISOLATION (Amendment 8)
  // ---------------------------------------------------------------------------
  describe('Teacher Scope & Multi-Programme Student Scoping (Mandatory Scenario)', () => {
    it('ALLOWS Teacher A to access Ahmed in Primary 4 Mathematics', async () => {
      const result = await assertTeacherStudentScope(teacherUserA.id, {
        studentId: studentAhmed.id,
        programmeId: primaryProg.id,
        schoolClassId: primary4Class.id,
        subjectId: mathSubject.id,
        academicSessionId: academicSession.id,
      });

      expect(result).toBeDefined();
      expect(result.enrollment.studentId).toBe(studentAhmed.id);
      expect(result.enrollment.programmeId).toBe(primaryProg.id);
      expect(result.teacherScope.subjectId).toBe(mathSubject.id);
    });

    it('DENIES Teacher A from accessing Ahmed in Tahfeez programme (Multi-Programme Isolation)', async () => {
      // Even though Ahmed is in Primary 4, Teacher A must NOT access Ahmed's Tahfeez records
      await expect(
        assertTeacherStudentScope(teacherUserA.id, {
          studentId: studentAhmed.id,
          programmeId: tahfeezProg.id,
          schoolClassId: tahfeezClass.id,
          subjectId: quranSubject.id,
          academicSessionId: academicSession.id,
        })
      ).rejects.toMatchObject({
        code: 'SCOPE_UNAUTHORIZED',
        statusCode: 403,
      });
    });

    it('DENIES Teacher A from accessing Primary 5 records (Class Scope Isolation)', async () => {
      await expect(
        assertTeacherScope(teacherUserA.id, {
          programmeId: primaryProg.id,
          schoolClassId: primary5Class.id,
          subjectId: mathSubject.id,
          academicSessionId: academicSession.id,
        })
      ).rejects.toMatchObject({
        code: 'SCOPE_UNAUTHORIZED',
        statusCode: 403,
      });
    });

    it('DENIES Teacher A from accessing an unrelated student outside assigned class (Zainab in Primary 5)', async () => {
      await expect(
        assertTeacherStudentScope(teacherUserA.id, {
          studentId: studentUnrelated.id,
          programmeId: primaryProg.id,
          schoolClassId: primary5Class.id,
          subjectId: mathSubject.id,
          academicSessionId: academicSession.id,
        })
      ).rejects.toMatchObject({
        code: 'SCOPE_UNAUTHORIZED',
        statusCode: 403,
      });
    });

    it('DENIES Teacher A from accessing English records in Primary 4 (Subject Scope Isolation)', async () => {
      await expect(
        assertTeacherScope(teacherUserA.id, {
          programmeId: primaryProg.id,
          schoolClassId: primary4Class.id,
          subjectId: englishSubject.id,
          academicSessionId: academicSession.id,
        })
      ).rejects.toMatchObject({
        code: 'SCOPE_UNAUTHORIZED',
        statusCode: 403,
      });
    });

    it('DENIES Teacher A access to records in a different academic session', async () => {
      await expect(
        assertTeacherScope(teacherUserA.id, {
          programmeId: primaryProg.id,
          schoolClassId: primary4Class.id,
          subjectId: mathSubject.id,
          academicSessionId: otherAcademicSession.id,
        })
      ).rejects.toMatchObject({
        code: 'SCOPE_UNAUTHORIZED',
        statusCode: 403,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // API PARAMETER TAMPERING NEGATIVE TESTS (Amendment 7)
  // ---------------------------------------------------------------------------
  describe('API Parameter Tampering & Elevation Prevention', () => {
    it('blocks elevation when client substitutes a foreign programmeId for an enrolled student', async () => {
      // Trying to query Ahmed with Primary class but passing Creche programmeId
      const crecheProg = await prisma.programme.findUniqueOrThrow({
        where: { code: ProgrammeCode.CRECHE },
      });

      await expect(
        assertTeacherStudentScope(teacherUserA.id, {
          studentId: studentAhmed.id,
          programmeId: crecheProg.id,
          schoolClassId: primary4Class.id,
          subjectId: mathSubject.id,
          academicSessionId: academicSession.id,
        })
      ).rejects.toMatchObject({
        code: 'STUDENT_NOT_ENROLLED_IN_PROGRAMME',
        statusCode: 403,
      });
    });

    it('blocks elevation when client swaps schoolClassId while targeting an enrolled student', async () => {
      // Ahmed is in Primary 4; client maliciously sends primary5Class.id
      await expect(
        assertTeacherStudentScope(teacherUserA.id, {
          studentId: studentAhmed.id,
          programmeId: primaryProg.id,
          schoolClassId: primary5Class.id,
          subjectId: mathSubject.id,
          academicSessionId: academicSession.id,
        })
      ).rejects.toMatchObject({
        code: 'STUDENT_CLASS_MISMATCH',
        statusCode: 403,
      });
    });

    it('blocks elevation when a user without teacher profile attempts teacher scoping', async () => {
      await expect(
        assertTeacherScope(parentUser.id, {
          programmeId: primaryProg.id,
          schoolClassId: primary4Class.id,
          subjectId: mathSubject.id,
        })
      ).rejects.toMatchObject({
        code: 'TEACHER_PROFILE_MISSING',
        statusCode: 403,
      });
    });

    it('blocks elevation when a user without guardian profile attempts parent scoping', async () => {
      await expect(
        assertParentOwnsStudent(teacherUserA.id, studentAhmed.id)
      ).rejects.toMatchObject({
        code: 'GUARDIAN_PROFILE_MISSING',
        statusCode: 403,
      });
    });
  });
});
