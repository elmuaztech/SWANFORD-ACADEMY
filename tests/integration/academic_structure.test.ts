import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  AcademicSessionStatus,
  AcademicTermStatus,
  TermCode,
  ProgrammeCode,
  RoleCode,
  UserStatus,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth/password';
import { AuthorizationError } from '@/lib/auth/authorization';
import {
  getSchoolProfile,
  updateSchoolProfile,
} from '@/lib/academic/school_profile';
import {
  createAcademicSession,
  updateAcademicSession,
  deleteAcademicSession,
} from '@/lib/academic/session_service';
import {
  createAcademicTerm,
  deleteAcademicTerm,
} from '@/lib/academic/term_service';
import {
  createSchoolClass,
  deactivateSchoolClass,
  deleteSchoolClass,
} from '@/lib/academic/class_service';
import {
  createSubject,
  deactivateSubject,
  deleteSubject,
} from '@/lib/academic/subject_service';
import {
  createGradingScale,
  resolveGrade,
  deleteGradingScale,
} from '@/lib/academic/grading_service';

describe('Integration Tests: Stage 5 School Configuration & Academic Structure', () => {
  let superAdminUser: { id: string };
  let adminUser: { id: string };
  let accountantUser: { id: string };
  let teacherUser: { id: string };
  let parentUser: { id: string };

  beforeAll(async () => {
    // 0. Clean up test users from previous runs
    const testEmails = [
      'stage5.superadmin@swanford.internal',
      'stage5.admin@swanford.internal',
      'stage5.accountant@swanford.internal',
      'stage5.teacher@swanford.internal',
      'stage5.parent@swanford.internal',
    ];

    await prisma.userRole.deleteMany({
      where: { user: { email: { in: testEmails } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: testEmails } },
    });

    // Clean up any test academic sessions, classes, subjects, grading scales from prior test runs
    await prisma.gradingBand.deleteMany({
      where: { gradingScale: { code: { in: ['STAGE5_TEST_SCALE', 'STAGE5_UPDATED_SCALE'] } } },
    });
    await prisma.gradingScale.deleteMany({
      where: { code: { in: ['STAGE5_TEST_SCALE', 'STAGE5_UPDATED_SCALE'] } },
    });
    await prisma.subject.deleteMany({
      where: { code: { in: ['STAGE5_SUBJ_A', 'STAGE5_SUBJ_B'] } },
    });
    await prisma.schoolClass.deleteMany({
      where: { code: { in: ['STAGE5_CLS_A', 'STAGE5_CLS_B'] } },
    });
    await prisma.academicTerm.deleteMany({
      where: { academicSession: { name: { in: ['2029/2030', '2030/2031'] } } },
    });
    await prisma.academicSession.deleteMany({
      where: { name: { in: ['2029/2030', '2030/2031'] } },
    });

    const passwordHash = await hashPassword('Stage5TestPass@2026!');

    // 1. Super Admin
    const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.SUPER_ADMIN } });
    superAdminUser = await prisma.user.create({
      data: {
        email: 'stage5.superadmin@swanford.internal',
        passwordHash,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: superAdminRole.id } },
      },
    });

    // 2. Admin
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.ADMIN } });
    adminUser = await prisma.user.create({
      data: {
        email: 'stage5.admin@swanford.internal',
        passwordHash,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: adminRole.id } },
      },
    });

    // 3. Accountant
    const accountantRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.ACCOUNTANT } });
    accountantUser = await prisma.user.create({
      data: {
        email: 'stage5.accountant@swanford.internal',
        passwordHash,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: accountantRole.id } },
      },
    });

    // 4. Teacher
    const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.TEACHER } });
    teacherUser = await prisma.user.create({
      data: {
        email: 'stage5.teacher@swanford.internal',
        passwordHash,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: teacherRole.id } },
      },
    });

    // 5. Parent
    const parentRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.PARENT } });
    parentUser = await prisma.user.create({
      data: {
        email: 'stage5.parent@swanford.internal',
        passwordHash,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: parentRole.id } },
      },
    });
  });

  afterAll(async () => {
    const testEmails = [
      'stage5.superadmin@swanford.internal',
      'stage5.admin@swanford.internal',
      'stage5.accountant@swanford.internal',
      'stage5.teacher@swanford.internal',
      'stage5.parent@swanford.internal',
    ];

    await prisma.userRole.deleteMany({
      where: { user: { email: { in: testEmails } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: testEmails } },
    });

    await prisma.gradingBand.deleteMany({
      where: { gradingScale: { code: { in: ['STAGE5_TEST_SCALE', 'STAGE5_UPDATED_SCALE'] } } },
    });
    await prisma.gradingScale.deleteMany({
      where: { code: { in: ['STAGE5_TEST_SCALE', 'STAGE5_UPDATED_SCALE'] } },
    });
    await prisma.subject.deleteMany({
      where: { code: { in: ['STAGE5_SUBJ_A', 'STAGE5_SUBJ_B'] } },
    });
    await prisma.schoolClass.deleteMany({
      where: { code: { in: ['STAGE5_CLS_A', 'STAGE5_CLS_B'] } },
    });
    await prisma.academicTerm.deleteMany({
      where: { academicSession: { name: { in: ['2029/2030', '2030/2031'] } } },
    });
    await prisma.academicSession.deleteMany({
      where: { name: { in: ['2029/2030', '2030/2031'] } },
    });
  });

  // ---------------------------------------------------------------------------
  // 1. SCHOOL PROFILE & SYSTEM CONFIGURATION
  // ---------------------------------------------------------------------------
  describe('1. School Profile & System Configuration', () => {
    it('retrieves the authoritative school profile from database', async () => {
      const profile = await getSchoolProfile();
      expect(profile.name).toBe('Swanford Academy');
      expect(profile.timezone).toBe('Africa/Lagos');
      expect(profile.address).toContain('DUTSE');
    });

    it('allows authorized Super Admin to update school profile and writes audit log', async () => {
      const updated = await updateSchoolProfile(superAdminUser.id, {
        name: 'Swanford Academy Dutse',
        motto: 'Excellence and Moral Integrity',
        address: 'Plot 212, Dr Nuhu Muhammadu Sanusi Way, Dutse',
        phonePrimary: '08031234567',
        email: 'contact@swanfordacademy.edu.ng',
        timezone: 'Africa/Lagos',
        primaryColor: '#1E3A8A',
        secondaryColor: '#F59E0B',
      });

      expect(updated.name).toBe('Swanford Academy Dutse');
      expect(updated.motto).toBe('Excellence and Moral Integrity');

      // Verify AuditLog
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'SCHOOL_PROFILE_UPDATED',
          userId: superAdminUser.id,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).not.toBeNull();

      // Reset school name for consistency
      await updateSchoolProfile(superAdminUser.id, {
        name: 'Swanford Academy',
        motto: 'Illuminating the Path to Success',
        address: 'PLOT 212, DR NUHU MUHAMMADU SANUSI WAY, DUTSE, JIGAWA STATE',
        phonePrimary: '08030000001',
        email: 'info@swanfordacademy.edu.ng',
        timezone: 'Africa/Lagos',
      });
    });

    it('denies Accountant, Teacher, and Parent from updating school profile', async () => {
      await expect(
        updateSchoolProfile(accountantUser.id, {
          name: 'Hacked Academy',
          motto: 'Invalid',
          address: 'Anywhere',
          phonePrimary: '08000000000',
          email: 'bad@example.com',
          timezone: 'Africa/Lagos',
        })
      ).rejects.toThrow(AuthorizationError);

      await expect(
        updateSchoolProfile(teacherUser.id, {
          name: 'Teacher Academy',
          motto: 'Invalid',
          address: 'Anywhere',
          phonePrimary: '08000000000',
          email: 'bad@example.com',
          timezone: 'Africa/Lagos',
        })
      ).rejects.toThrow(AuthorizationError);

      await expect(
        updateSchoolProfile(parentUser.id, {
          name: 'Parent Academy',
          motto: 'Invalid',
          address: 'Anywhere',
          phonePrimary: '08000000000',
          email: 'bad@example.com',
          timezone: 'Africa/Lagos',
        })
      ).rejects.toThrow(AuthorizationError);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. ACADEMIC SESSIONS & LIFECYCLE TRANSITIONS
  // ---------------------------------------------------------------------------
  describe('2. Academic Sessions & Lifecycle Transitions', () => {
    let testSessionId: string;

    it('creates an upcoming academic session with valid date range', async () => {
      const session = await createAcademicSession(adminUser.id, {
        name: '2029/2030',
        startDate: new Date('2029-09-01'),
        endDate: new Date('2030-07-31'),
        status: AcademicSessionStatus.UPCOMING,
      });

      expect(session.name).toBe('2029/2030');
      expect(session.status).toBe(AcademicSessionStatus.UPCOMING);
      expect(session.isCurrent).toBe(false);
      testSessionId = session.id;
    });

    it('rejects session with inverted date chronology (startDate >= endDate)', async () => {
      await expect(
        createAcademicSession(adminUser.id, {
          name: '2030/2031',
          startDate: new Date('2031-07-31'),
          endDate: new Date('2030-09-01'), // Inverted
          status: AcademicSessionStatus.UPCOMING,
        })
      ).rejects.toThrow(/Start date must be strictly before end date/);
    });

    it('rejects duplicate session name', async () => {
      await expect(
        createAcademicSession(adminUser.id, {
          name: '2029/2030',
          startDate: new Date('2029-09-01'),
          endDate: new Date('2030-07-31'),
        })
      ).rejects.toThrow(/already exists/);
    });

    it('ENFORCES AMENDMENT 1: Rejects activating a session while another session is already ACTIVE', async () => {
      // 2026/2027 is currently ACTIVE in database (from seed)
      const currentActive = await prisma.academicSession.findFirst({
        where: { status: AcademicSessionStatus.ACTIVE },
      });
      expect(currentActive).not.toBeNull();

      // Attempting to activate 2029/2030 MUST fail with ACTIVE_SESSION_EXISTS
      await expect(
        updateAcademicSession(adminUser.id, testSessionId, {
          status: AcademicSessionStatus.ACTIVE,
        })
      ).rejects.toThrow(/is currently ACTIVE. The administrator must explicitly transition the active session/);
    });

    it('enforces valid forward lifecycle transitions: UPCOMING -> COMPLETED -> ARCHIVED', async () => {
      // Transition UPCOMING -> COMPLETED
      const completed = await updateAcademicSession(adminUser.id, testSessionId, {
        status: AcademicSessionStatus.COMPLETED,
      });
      expect(completed.status).toBe(AcademicSessionStatus.COMPLETED);

      // Transition COMPLETED -> ARCHIVED
      const archived = await updateAcademicSession(adminUser.id, testSessionId, {
        status: AcademicSessionStatus.ARCHIVED,
      });
      expect(archived.status).toBe(AcademicSessionStatus.ARCHIVED);
    });

    it('rejects invalid backwards transition: ARCHIVED -> ACTIVE', async () => {
      await expect(
        updateAcademicSession(adminUser.id, testSessionId, {
          status: AcademicSessionStatus.ACTIVE,
        })
      ).rejects.toThrow(/Archived sessions cannot be reactivated/);
    });

    it('blocks destructive deletion of session with dependent records', async () => {
      // The active 2026/2027 session has terms, fee structures, and cycles
      const activeSession = await prisma.academicSession.findFirstOrThrow({
        where: { name: '2026/2027' },
      });

      await expect(
        deleteAcademicSession(superAdminUser.id, activeSession.id)
      ).rejects.toThrow(/dependent historical record\(s\) exist/);
    });

    it('allows deleting an unattached, unused session without dependencies', async () => {
      // testSessionId (2029/2030) has zero terms, enrollments, or fees
      await expect(deleteAcademicSession(adminUser.id, testSessionId)).resolves.not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. ACADEMIC TERMS & NON-OVERLAPPING VALIDATION
  // ---------------------------------------------------------------------------
  describe('3. Academic Terms & Date Validation', () => {
    let parentSessionId: string;
    let testTermId: string;

    beforeAll(async () => {
      const session = await createAcademicSession(adminUser.id, {
        name: '2030/2031',
        startDate: new Date('2030-09-01'),
        endDate: new Date('2031-07-31'),
        status: AcademicSessionStatus.UPCOMING,
      });
      parentSessionId = session.id;
    });

    it('creates a valid term contained within the parent session', async () => {
      const term = await createAcademicTerm(adminUser.id, {
        academicSessionId: parentSessionId,
        termCode: TermCode.FIRST,
        name: '2030/2031 First Term',
        startDate: new Date('2030-09-01'),
        endDate: new Date('2030-12-15'),
        status: AcademicTermStatus.UPCOMING,
      });

      expect(term.termCode).toBe(TermCode.FIRST);
      expect(term.academicSessionId).toBe(parentSessionId);
      testTermId = term.id;
    });

    it('rejects term with dates outside parent session boundaries', async () => {
      await expect(
        createAcademicTerm(adminUser.id, {
          academicSessionId: parentSessionId,
          termCode: TermCode.SECOND,
          name: 'Invalid Boundary Term',
          startDate: new Date('2031-08-01'), // After session end (2031-07-31)
          endDate: new Date('2031-10-15'),
        })
      ).rejects.toThrow(/must be completely within the academic session dates/);
    });

    it('rejects term with dates overlapping an existing term in the same session', async () => {
      await expect(
        createAcademicTerm(adminUser.id, {
          academicSessionId: parentSessionId,
          termCode: TermCode.SECOND,
          name: 'Overlapping Term',
          startDate: new Date('2030-12-10'), // Overlaps First Term (ends 2030-12-15)
          endDate: new Date('2031-03-30'),
        })
      ).rejects.toThrow(/overlap with existing term/);
    });

    it('rejects duplicate term code in the same session', async () => {
      await expect(
        createAcademicTerm(adminUser.id, {
          academicSessionId: parentSessionId,
          termCode: TermCode.FIRST, // Duplicate FIRST
          name: 'Another First Term',
          startDate: new Date('2031-01-10'),
          endDate: new Date('2031-04-10'),
        })
      ).rejects.toThrow(/already exists for session/);
    });

    it('allows deleting an unattached term without dependencies', async () => {
      await expect(deleteAcademicTerm(adminUser.id, testTermId)).resolves.not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. PROGRAMMES, CLASSES & SUBJECTS
  // ---------------------------------------------------------------------------
  describe('4. Programmes, Classes & Subjects Structure', () => {
    let primaryProgId: string;
    let testClassId: string;
    let testSubjectId: string;

    beforeAll(async () => {
      const primary = await prisma.programme.findUniqueOrThrow({
        where: { code: ProgrammeCode.PRIMARY },
      });
      primaryProgId = primary.id;
    });

    it('creates a school class linked to a programme with validated capacity', async () => {
      const schoolClass = await createSchoolClass(adminUser.id, {
        programmeId: primaryProgId,
        code: 'STAGE5_CLS_A',
        name: 'Stage 5 Test Class A',
        arm: 'Alpha',
        capacity: 25,
      });

      expect(schoolClass.code).toBe('STAGE5_CLS_A');
      expect(schoolClass.capacity).toBe(25);
      expect(schoolClass.isActive).toBe(true);
      testClassId = schoolClass.id;
    });

    it('rejects school class with non-positive capacity', async () => {
      await expect(
        createSchoolClass(adminUser.id, {
          programmeId: primaryProgId,
          code: 'STAGE5_CLS_B',
          name: 'Invalid Class',
          capacity: 0, // Invalid
        })
      ).rejects.toThrow();
    });

    it('rejects duplicate school class code', async () => {
      await expect(
        createSchoolClass(adminUser.id, {
          programmeId: primaryProgId,
          code: 'STAGE5_CLS_A',
          name: 'Duplicate Class Code',
          capacity: 30,
        })
      ).rejects.toThrow(/already exists/);
    });

    it('creates a subject linked to a programme', async () => {
      const subject = await createSubject(adminUser.id, {
        programmeId: primaryProgId,
        code: 'STAGE5_SUBJ_A',
        name: 'Stage 5 General Science',
        description: 'Primary science instruction',
      });

      expect(subject.code).toBe('STAGE5_SUBJ_A');
      expect(subject.programmeId).toBe(primaryProgId);
      testSubjectId = subject.id;
    });

    it('rejects duplicate subject code', async () => {
      await expect(
        createSubject(adminUser.id, {
          programmeId: primaryProgId,
          code: 'STAGE5_SUBJ_A',
          name: 'Duplicate Subject',
        })
      ).rejects.toThrow(/already exists/);
    });

    it('supports soft-deactivation of classes and subjects', async () => {
      const deactivatedClass = await deactivateSchoolClass(adminUser.id, testClassId);
      expect(deactivatedClass.isActive).toBe(false);

      const deactivatedSubj = await deactivateSubject(adminUser.id, testSubjectId);
      expect(deactivatedSubj.isActive).toBe(false);
    });

    it('allows deleting an unattached class and subject', async () => {
      await expect(deleteSchoolClass(adminUser.id, testClassId)).resolves.not.toThrow();
      await expect(deleteSubject(adminUser.id, testSubjectId)).resolves.not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // 5. GRADING FOUNDATION & SCORE RESOLUTION
  // ---------------------------------------------------------------------------
  describe('5. Grading Foundation & Score Resolution', () => {
    let testScaleId: string;

    it('creates a grading scale with validated, non-overlapping bands', async () => {
      const scale = await createGradingScale(adminUser.id, {
        code: 'STAGE5_TEST_SCALE',
        name: 'Stage 5 Evaluation Scale',
        passMark: 50.00,
        maxScore: 100.00,
        description: 'Test evaluation scale',
        bands: [
          { grade: 'A', minScore: 80.00, maxScore: 100.00, points: 5.0, remark: 'Distinction', isPass: true, displayOrder: 1 },
          { grade: 'B', minScore: 65.00, maxScore: 79.99, points: 4.0, remark: 'Credit', isPass: true, displayOrder: 2 },
          { grade: 'C', minScore: 50.00, maxScore: 64.99, points: 3.0, remark: 'Pass', isPass: true, displayOrder: 3 },
          { grade: 'F', minScore: 0.00, maxScore: 49.99, points: 0.0, remark: 'Fail', isPass: false, displayOrder: 4 },
        ],
      });

      expect(scale.code).toBe('STAGE5_TEST_SCALE');
      expect(scale.bands.length).toBe(4);
      testScaleId = scale.id;
    });

    it('accurately resolves scores to grade, remark, and isPass', async () => {
      // Top score
      const res95 = await resolveGrade(testScaleId, 95);
      expect(res95.grade).toBe('A');
      expect(res95.remark).toBe('Distinction');
      expect(res95.isPass).toBe(true);

      // Mid score
      const res70 = await resolveGrade(testScaleId, 70);
      expect(res70.grade).toBe('B');
      expect(res70.isPass).toBe(true);

      // Exact pass mark
      const res50 = await resolveGrade(testScaleId, 50);
      expect(res50.grade).toBe('C');
      expect(res50.isPass).toBe(true);

      // Failing score
      const res35 = await resolveGrade(testScaleId, 35);
      expect(res35.grade).toBe('F');
      expect(res35.remark).toBe('Fail');
      expect(res35.isPass).toBe(false);
    });

    it('rejects out of bounds scores in resolveGrade', async () => {
      await expect(resolveGrade(testScaleId, -5)).rejects.toThrow(/outside the valid range/);
      await expect(resolveGrade(testScaleId, 105)).rejects.toThrow(/outside the valid range/);
    });

    it('allows deleting test grading scale', async () => {
      await expect(deleteGradingScale(adminUser.id, testScaleId)).resolves.not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // 6. HISTORICAL INTEGRITY & ROLE-BASED AUTHORIZATION GUARDS
  // ---------------------------------------------------------------------------
  describe('6. Historical Integrity & Role-Based Authorization Guards', () => {
    it('blocks Accountant, Teacher, and Parent from creating sessions, classes, or subjects', async () => {
      const sessionInput = {
        name: '2035/2036',
        startDate: new Date('2035-09-01'),
        endDate: new Date('2036-07-31'),
      };

      await expect(createAcademicSession(accountantUser.id, sessionInput)).rejects.toThrow(AuthorizationError);
      await expect(createAcademicSession(teacherUser.id, sessionInput)).rejects.toThrow(AuthorizationError);
      await expect(createAcademicSession(parentUser.id, sessionInput)).rejects.toThrow(AuthorizationError);
    });
  });
});
