import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { RoleCode, UserStatus, Gender, RelationshipType } from '@prisma/client';
import { generateSecureToken } from '@/lib/auth/tokens';
import { POST as loginRoute } from '@/app/api/auth/login/route';
import { GET as getSettingsRoute, PUT as putSettingsRoute } from '@/app/api/admin/settings/route';
import { GET as getSuperAdminConfig } from '@/app/api/super-admin/config/route';
import { createAdminTeacher } from '@/lib/admin/admin_service';
import {
  createGuardian,
  provisionGuardianUserAccount,
  getGuardianById,
} from '@/lib/guardians/guardian_service';
import {
  linkGuardianToStudent,
  revokeRelationship,
} from '@/lib/guardians/relationship_service';
import { getParentProfile, getParentChildProfile } from '@/lib/parent/parent_service';
import { assertTeacherScope } from '@/lib/auth/scopes';
import { activateAccount, SafeUser, sanitizeUser } from '@/lib/auth/service';
import { hashToken } from '@/lib/auth/tokens';
import { NextRequest } from 'next/server';

describe('Final Integration: User Accounts, Teacher/Parent Lifecycle, Scopes, Isolation & Settings', { timeout: 30000 }, () => {
  let superAdminUser: SafeUser;
  let superAdminCookie: string;
  let activeSessionId: string;
  let primaryProgrammeId: string;
  let schoolClass1Id: string;
  let schoolClass2Id: string;

  // Cleanup tracking
  const createdUserIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdGuardianIds: string[] = [];
  const createdTeacherIds: string[] = [];

  beforeAll(async () => {
    // 1. Resolve Super Admin
    const su = await prisma.user.findFirst({
      where: { userRoles: { some: { role: { code: RoleCode.SUPER_ADMIN } } } },
      include: { userRoles: { include: { role: true } } },
    });
    if (!su) throw new Error('Super Admin account not found in database.');

    superAdminUser = sanitizeUser(su as any);

    const token = generateSecureToken();
    await prisma.session.create({
      data: {
        userId: su.id,
        sessionTokenHash: token.tokenHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    superAdminCookie = `swanford_session=${token.rawToken}`;

    // 2. Resolve Active Session & Classes
    const session = await prisma.academicSession.findFirst({ where: { isCurrent: true } });
    if (!session) throw new Error('Active academic session required.');
    activeSessionId = session.id;

    const programme = await prisma.programme.findFirst({
      where: { isActive: true },
      include: { classes: true },
    });
    if (!programme) {
      throw new Error('Active programme required for isolation tests.');
    }
    primaryProgrammeId = programme.id;

    const progClasses = [...programme.classes];
    if (progClasses.length === 0) {
      const c1 = await prisma.schoolClass.create({
        data: {
          programmeId: programme.id,
          name: 'Class Test Isolation A',
          code: `CLS-A-${Date.now()}`,
        },
      });
      progClasses.push(c1);
    }
    if (progClasses.length === 1) {
      const c2 = await prisma.schoolClass.create({
        data: {
          programmeId: programme.id,
          name: 'Class Test Isolation B',
          code: `CLS-B-${Date.now()}`,
        },
      });
      progClasses.push(c2);
    }

    schoolClass1Id = progClasses[0].id;
    schoolClass2Id = progClasses[1].id;
  });

  afterAll(async () => {
    // Clean up all test fixtures in correct relational order
    if (createdTeacherIds.length > 0) {
      await prisma.teacherScope.deleteMany({ where: { teacherId: { in: createdTeacherIds } } });
      await prisma.teacher.deleteMany({ where: { id: { in: createdTeacherIds } } });
    }
    if (createdGuardianIds.length > 0) {
      await prisma.guardianStudentRelationship.deleteMany({
        where: { guardianId: { in: createdGuardianIds } },
      });
      await prisma.guardian.deleteMany({ where: { id: { in: createdGuardianIds } } });
    }
    if (createdStudentIds.length > 0) {
      await prisma.studentProgrammeEnrollment.deleteMany({
        where: { studentId: { in: createdStudentIds } },
      });
      await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.emailVerification.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.passwordReset.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  // =========================================================================
  // 1. TEACHER LIFECYCLE & ISOLATION
  // =========================================================================
  describe('Teacher Account Provisioning, Activation, Login & Scope Isolation', () => {
    const teacherEmail = `test.teacher.${Date.now()}@swanford.test`;
    let teacherUserId: string;
    let teacherProfileId: string;
    let activationRawToken: string;

    it('provisions a genuine teacher account and sends activation token', async () => {
      const teacher = await createAdminTeacher(
        superAdminUser,
        {
          email: teacherEmail,
          firstName: 'Chinedu',
          lastName: 'Okafor',
          phonePrimary: '08022223333',
          qualification: 'B.Sc. Mathematics',
          scopes: [
            {
              programmeId: primaryProgrammeId,
              schoolClassId: schoolClass1Id,
              isClassTeacher: true,
            },
          ],
        },
        '127.0.0.1'
      );

      expect(teacher).toBeDefined();
      expect(teacher.user.email).toBe(teacherEmail);
      expect(teacher.user.status).toBe(UserStatus.PENDING_VERIFICATION);
      expect(teacher.scopes).toHaveLength(1);

      teacherUserId = teacher.user.id;
      teacherProfileId = teacher.id;
      createdUserIds.push(teacherUserId);
      createdTeacherIds.push(teacherProfileId);

      // Verify email verification token exists
      const verif = await prisma.emailVerification.findFirst({
        where: { userId: teacherUserId },
        orderBy: { createdAt: 'desc' },
      });
      expect(verif).toBeDefined();
      expect(verif?.tokenType).toBe('ACCOUNT_ACTIVATION');
      expect(verif?.usedAt).toBeNull();
    });

    it('activates teacher account with a secure password', async () => {
      // Create a fresh activation token to simulate the link clicked from email
      const { rawToken, tokenHash } = generateSecureToken();
      await prisma.emailVerification.create({
        data: {
          userId: teacherUserId,
          email: teacherEmail,
          tokenHash,
          tokenType: 'ACCOUNT_ACTIVATION',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      activationRawToken = rawToken;

      const activated = await activateAccount({
        rawToken: activationRawToken,
        newPassword: 'TeacherPassword123!',
        ipAddress: '127.0.0.1',
      });

      expect(activated.id).toBe(teacherUserId);
      expect(activated.status).toBe(UserStatus.ACTIVE);

      // Verify token is now marked used
      const verif = await prisma.emailVerification.findUnique({
        where: { tokenHash },
      });
      expect(verif?.usedAt).not.toBeNull();
    });

    it('logs in the activated teacher and redirects to /teacher', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: teacherEmail,
          password: 'TeacherPassword123!',
        }),
      });

      const res = await loginRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.redirectUrl).toBe('/teacher');
      expect(json.user.roles).toContain(RoleCode.TEACHER);
    });

    it('enforces pedagogical scope isolation (teacher CANNOT access unassigned class)', async () => {
      // Authorized: schoolClass1
      const authorizedScope = await assertTeacherScope(teacherUserId, {
        programmeId: primaryProgrammeId,
        schoolClassId: schoolClass1Id,
        academicSessionId: activeSessionId,
      });
      expect(authorizedScope).toBeDefined();

      // Unauthorized: schoolClass2
      await expect(
        assertTeacherScope(teacherUserId, {
          programmeId: primaryProgrammeId,
          schoolClassId: schoolClass2Id,
          academicSessionId: activeSessionId,
        })
      ).rejects.toThrow('outside teacher assigned scope');
    });
  });

  // =========================================================================
  // 2. PARENT LIFECYCLE, MULTI-CHILD & STRICT IDOR ISOLATION
  // =========================================================================
  describe('Parent Account Provisioning, Multi-Child Linking & Strict IDOR Isolation', () => {
    const parentAEmail = `parent.a.${Date.now()}@swanford.test`;
    const parentBEmail = `parent.b.${Date.now()}@swanford.test`;

    let guardianAId: string;
    let guardianBId: string;
    let parentAUserId: string;
    let parentBUserId: string;

    let student1Id: string;
    let student2Id: string;
    let student3Id: string;

    it('creates test students and guardians', async () => {
      // Create 3 students
      const s1 = await prisma.student.create({
        data: {
          admissionNumber: `TST-${Date.now()}-001`,
          firstName: 'Fatima',
          lastName: 'Bello',
          gender: Gender.FEMALE,
          dateOfBirth: new Date('2018-05-12'),
        },
      });
      const s2 = await prisma.student.create({
        data: {
          admissionNumber: `TST-${Date.now()}-002`,
          firstName: 'Tariq',
          lastName: 'Bello',
          gender: Gender.MALE,
          dateOfBirth: new Date('2020-08-20'),
        },
      });
      const s3 = await prisma.student.create({
        data: {
          admissionNumber: `TST-${Date.now()}-003`,
          firstName: 'Emeka',
          lastName: 'Nnamdi',
          gender: Gender.MALE,
          dateOfBirth: new Date('2019-03-15'),
        },
      });

      student1Id = s1.id;
      student2Id = s2.id;
      student3Id = s3.id;
      createdStudentIds.push(s1.id, s2.id, s3.id);

      // Create Guardian A
      const gA = await createGuardian(superAdminUser, {
        title: 'Alhaji',
        firstName: 'Faruk',
        lastName: 'Bello',
        email: parentAEmail,
        phonePrimary: '08099991111',
      });
      guardianAId = gA.guardian.id;
      createdGuardianIds.push(guardianAId);

      // Create Guardian B
      const gB = await createGuardian(superAdminUser, {
        title: 'Chief',
        firstName: 'Obi',
        lastName: 'Nnamdi',
        email: parentBEmail,
        phonePrimary: '08099992222',
      });
      guardianBId = gB.guardian.id;
      createdGuardianIds.push(guardianBId);
    });

    it('provisions genuine portal accounts for both guardians', async () => {
      const resA = await provisionGuardianUserAccount(superAdminUser, guardianAId, '127.0.0.1');
      expect(resA.success).toBe(true);
      expect(resA.user).toBeDefined();
      expect(resA.user.status).toBe(UserStatus.PENDING_VERIFICATION);
      parentAUserId = resA.user.id;
      createdUserIds.push(parentAUserId);

      const resB = await provisionGuardianUserAccount(superAdminUser, guardianBId, '127.0.0.1');
      expect(resB.success).toBe(true);
      parentBUserId = resB.user.id;
      createdUserIds.push(parentBUserId);
    });

    it('links multiple children to Parent A and one child to Parent B', async () => {
      // Parent A has Fatima (s1) and Tariq (s2)
      await linkGuardianToStudent(superAdminUser, {
        guardianId: guardianAId,
        studentId: student1Id,
        relationshipType: RelationshipType.FATHER,
        isPrimaryContact: true,
      });
      await linkGuardianToStudent(superAdminUser, {
        guardianId: guardianAId,
        studentId: student2Id,
        relationshipType: RelationshipType.FATHER,
        isPrimaryContact: true,
      });

      // Parent B has Emeka (s3)
      await linkGuardianToStudent(superAdminUser, {
        guardianId: guardianBId,
        studentId: student3Id,
        relationshipType: RelationshipType.FATHER,
        isPrimaryContact: true,
      });

      // Verify Guardian A details include 2 wards
      const gA = await getGuardianById(superAdminUser, guardianAId);
      expect(gA.relationships).toHaveLength(2);
      expect(gA.user).toBeDefined();
      expect(gA.user?.email).toBe(parentAEmail);
    });

    it('activates Parent A and logs in with destination /parent', async () => {
      const { rawToken } = generateSecureToken();
      await prisma.emailVerification.create({
        data: {
          userId: parentAUserId,
          email: parentAEmail,
          tokenHash: hashToken(rawToken),
          tokenType: 'ACCOUNT_ACTIVATION',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      await activateAccount({
        rawToken,
        newPassword: 'ParentPassword123!',
        ipAddress: '127.0.0.1',
      });

      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: parentAEmail,
          password: 'ParentPassword123!',
        }),
      });

      const res = await loginRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.redirectUrl).toBe('/parent');
      expect(json.user.roles).toContain(RoleCode.PARENT);
    });

    it('Parent A sees BOTH of their children in getParentProfile', async () => {
      const profile = await getParentProfile(parentAUserId);
      expect(profile.children).toHaveLength(2);

      const studentIds = profile.children.map((c) => c.studentId);
      expect(studentIds).toContain(student1Id);
      expect(studentIds).toContain(student2Id);
      expect(studentIds).not.toContain(student3Id);
    });

    it('CRITICAL IDOR TEST: Parent A CANNOT access Parent B child data', async () => {
      // Parent A querying their own children: works
      const ownChild = await getParentChildProfile(parentAUserId, student1Id);
      expect(ownChild.student.id).toBe(student1Id);

      // Parent A attempting to access Parent B's child (student3): MUST THROW 403
      await expect(
        getParentChildProfile(parentAUserId, student3Id)
      ).rejects.toThrow('You are not authorized to view or manage records for this student');
    });

    it('CRITICAL IDOR TEST: Parent B CANNOT access Parent A children data', async () => {
      // Activate Parent B account first
      const { rawToken } = generateSecureToken();
      await prisma.emailVerification.create({
        data: {
          userId: parentBUserId,
          email: parentBEmail,
          tokenHash: hashToken(rawToken),
          tokenType: 'ACCOUNT_ACTIVATION',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      await activateAccount({
        rawToken,
        newPassword: 'ParentBPassword123!',
        ipAddress: '127.0.0.1',
      });

      // Active authenticated Parent B attempting to access Parent A's children: MUST THROW 403
      await expect(
        getParentChildProfile(parentBUserId, student1Id)
      ).rejects.toThrow('You are not authorized to view or manage records for this student');

      await expect(
        getParentChildProfile(parentBUserId, student2Id)
      ).rejects.toThrow('You are not authorized to view or manage records for this student');
    });

    it('revoking a relationship immediately revokes access for that student', async () => {
      const rel = await prisma.guardianStudentRelationship.findFirst({
        where: { guardianId: guardianAId, studentId: student2Id },
      });
      expect(rel).toBeDefined();

      await revokeRelationship(superAdminUser, rel!.id, 'Administrative testing');

      // Parent A can no longer access student2
      await expect(
        getParentChildProfile(parentAUserId, student2Id)
      ).rejects.toThrow('You are not authorized to view or manage records for this student');

      // But Parent A CAN still access student1
      const stillOwnsS1 = await getParentChildProfile(parentAUserId, student1Id);
      expect(stillOwnsS1.student.id).toBe(student1Id);
    });
  });

  // =========================================================================
  // 3. PERSISTENT EDITABLE SCHOOL SETTINGS
  // =========================================================================
  describe('School Settings Persistence & Dynamic Serving', () => {
    const updatedPhone = '08099887766';
    const updatedEmail = 'info.persisted@swanford.sch.ng';
    const updatedMotto = 'Knowledge, Character, and Faith (Persisted)';
    const updatedBankName = 'Guaranty Trust Bank';
    const updatedAccountNo = '0123456789';

    it('allows Super Admin to update school profile and persists to PostgreSQL', async () => {
      const putReq = new NextRequest('http://localhost:3000/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: superAdminCookie,
        },
        body: JSON.stringify({
          phonePrimary: updatedPhone,
          email: updatedEmail,
          motto: updatedMotto,
          bankName: updatedBankName,
          bankAccountNumber: updatedAccountNo,
        }),
      });

      const putRes = await putSettingsRoute(putReq);
      expect(putRes.status).toBe(200);

      const putJson = await putRes.json();
      expect(putJson.success).toBe(true);
      expect(putJson.profile.phonePrimary).toBe(updatedPhone);
      expect(putJson.profile.email).toBe(updatedEmail);
      expect(putJson.profile.motto).toBe(updatedMotto);
      expect(putJson.profile.bankName).toBe(updatedBankName);
      expect(putJson.profile.bankAccountNumber).toBe(updatedAccountNo);
    });

    it('GET /api/admin/settings reflects the persisted PostgreSQL values', async () => {
      const getReq = new NextRequest('http://localhost:3000/api/admin/settings', {
        method: 'GET',
        headers: { Cookie: superAdminCookie },
      });

      const getRes = await getSettingsRoute(getReq);
      expect(getRes.status).toBe(200);

      const getJson = await getRes.json();
      expect(getJson.profile.phonePrimary).toBe(updatedPhone);
      expect(getJson.profile.email).toBe(updatedEmail);
      expect(getJson.profile.motto).toBe(updatedMotto);
      expect(getJson.profile.bankName).toBe(updatedBankName);
      expect(getJson.profile.bankAccountNumber).toBe(updatedAccountNo);
    });

    it('GET /api/super-admin/config serves the updated profile to client portals', async () => {
      const configReq = new NextRequest('http://localhost:3000/api/super-admin/config', {
        method: 'GET',
        headers: { Cookie: superAdminCookie },
      });

      const configRes = await getSuperAdminConfig(configReq);
      expect(configRes.status).toBe(200);

      const configJson = await configRes.json();
      expect(configJson.schoolProfile.phonePrimary).toBe(updatedPhone);
      expect(configJson.schoolProfile.email).toBe(updatedEmail);
      expect(configJson.schoolProfile.motto).toBe(updatedMotto);
    });
  });
});
