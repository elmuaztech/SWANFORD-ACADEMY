import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { loginUser } from '@/lib/auth/service';
import { hashPassword } from '@/lib/auth/password';
import { GET as getSuperAdminUsers } from '@/app/api/super-admin/users/route';
import { GET as getSuperAdminAudit } from '@/app/api/super-admin/audit/route';
import { GET as getFinanceSummary } from '@/app/api/admin/finance/summary/route';
import { GET as getChildAttendance } from '@/app/api/parent/children/[id]/attendance/route';
import { GET as getChildFinance } from '@/app/api/parent/children/[id]/finance/route';
import { GET as getTeacherClassStudents } from '@/app/api/teacher/classes/[id]/students/route';
import { RoleCode, UserStatus, Gender, StudentStatus, RelationshipType } from '@prisma/client';

describe('Security Audit — Direct API Authorization, IDOR & Privilege Escalation', () => {
  let parent1SessionToken: string;
  let parent2SessionToken: string;
  let teacherSessionToken: string;
  let child1Id: string;
  let child2Id: string;
  let teacherId: string;
  let unassignedClassId: string;
  let primaryProgId: string;

  const parent1Email = `parent1.sec.${Date.now()}@example.com`;
  const parent2Email = `parent2.sec.${Date.now()}@example.com`;
  const teacherEmail = `teacher.sec.${Date.now()}@example.com`;
  const testPassword = 'SecurePassword2026!';

  beforeAll(async () => {
    const parentRole = await prisma.role.findUnique({ where: { code: RoleCode.PARENT } });
    const teacherRole = await prisma.role.findUnique({ where: { code: RoleCode.TEACHER } });
    const hashedPassword = await hashPassword(testPassword);

    // 1. Create Parent 1 & Child 1
    const u1 = await prisma.user.create({
      data: {
        email: parent1Email,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: parentRole!.id } },
      },
    });
    const g1 = await prisma.guardian.create({
      data: { userId: u1.id, firstName: 'Amina', lastName: 'Bello', email: parent1Email },
    });
    const c1 = await prisma.student.create({
      data: {
        admissionNumber: `SEC-P1-${Date.now()}`,
        firstName: 'Farida',
        lastName: 'Bello',
        gender: Gender.FEMALE,
        dateOfBirth: new Date('2017-05-10'),
        currentStatus: StudentStatus.ACTIVE,
      },
    });
    child1Id = c1.id;
    await prisma.guardianStudentRelationship.create({
      data: {
        guardianId: g1.id,
        studentId: c1.id,
        relationshipType: RelationshipType.MOTHER,
        isPrimaryContact: true,
        receivesInvoices: true,
        status: 'ACTIVE',
      },
    });

    // 2. Create Parent 2 & Child 2
    const u2 = await prisma.user.create({
      data: {
        email: parent2Email,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: parentRole!.id } },
      },
    });
    const g2 = await prisma.guardian.create({
      data: { userId: u2.id, firstName: 'Ibrahim', lastName: 'Musa', email: parent2Email },
    });
    const c2 = await prisma.student.create({
      data: {
        admissionNumber: `SEC-P2-${Date.now()}`,
        firstName: 'Zubairu',
        lastName: 'Musa',
        gender: Gender.MALE,
        dateOfBirth: new Date('2016-08-15'),
        currentStatus: StudentStatus.ACTIVE,
      },
    });
    child2Id = c2.id;
    await prisma.guardianStudentRelationship.create({
      data: {
        guardianId: g2.id,
        studentId: c2.id,
        relationshipType: RelationshipType.FATHER,
        isPrimaryContact: true,
        receivesInvoices: true,
        status: 'ACTIVE',
      },
    });

    // 3. Create Teacher
    const uTeacher = await prisma.user.create({
      data: {
        email: teacherEmail,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: teacherRole!.id } },
      },
    });
    const tProfile = await prisma.teacher.create({
      data: {
        userId: uTeacher.id,
        staffIdNumber: `STAFF-SEC-${Date.now()}`,
        firstName: 'Hassan',
        lastName: 'Umar',
      },
    });
    teacherId = tProfile.id;

    // Get an unassigned class and programme
    const p = await prisma.programme.findFirst();
    primaryProgId = p!.id;
    const c = await prisma.schoolClass.findFirst();
    unassignedClassId = c!.id;

    // 4. Authenticate and obtain real session tokens
    const p1Login = await loginUser({ email: parent1Email, password: testPassword });
    parent1SessionToken = p1Login.sessionToken;

    const p2Login = await loginUser({ email: parent2Email, password: testPassword });
    parent2SessionToken = p2Login.sessionToken;

    const tLogin = await loginUser({ email: teacherEmail, password: testPassword });
    teacherSessionToken = tLogin.sessionToken;
  });

  afterAll(async () => {
    await prisma.guardianStudentRelationship.deleteMany({
      where: { studentId: { in: [child1Id, child2Id] } },
    });
    await prisma.student.deleteMany({
      where: { id: { in: [child1Id, child2Id] } },
    });
    await prisma.guardian.deleteMany({
      where: { email: { in: [parent1Email, parent2Email] } },
    });
    await prisma.teacher.deleteMany({
      where: { user: { email: teacherEmail } },
    });
    await prisma.session.deleteMany({
      where: { user: { email: { in: [parent1Email, parent2Email, teacherEmail] } } },
    });
    await prisma.userRole.deleteMany({
      where: { user: { email: { in: [parent1Email, parent2Email, teacherEmail] } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [parent1Email, parent2Email, teacherEmail] } },
    });
  });

  describe('Unauthenticated Access Control (HTTP 401)', () => {
    it('rejects unauthenticated requests to Super Admin Users API with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/super-admin/users');
      const res = await getSuperAdminUsers(req);
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated requests to Super Admin Audit API with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/super-admin/audit');
      const res = await getSuperAdminAudit(req);
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated requests to Finance Summary API with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/finance/summary');
      const res = await getFinanceSummary(req);
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated requests to Parent Child Attendance API with 401', async () => {
      const req = new NextRequest(`http://localhost:3000/api/parent/children/${child1Id}/attendance`);
      const res = await getChildAttendance(req, { params: Promise.resolve({ id: child1Id }) });
      expect(res.status).toBe(401);
    });
  });

  describe('Role-Based Access Control (HTTP 403)', () => {
    it('rejects Parent user accessing Super Admin Users API with 403 Forbidden', async () => {
      const req = new NextRequest('http://localhost:3000/api/super-admin/users', {
        headers: { authorization: `Bearer ${parent1SessionToken}` },
      });
      const res = await getSuperAdminUsers(req);
      expect(res.status).toBe(403);
    });

    it('rejects Teacher user accessing Super Admin Audit API with 403 Forbidden', async () => {
      const req = new NextRequest('http://localhost:3000/api/super-admin/audit', {
        headers: { authorization: `Bearer ${teacherSessionToken}` },
      });
      const res = await getSuperAdminAudit(req);
      expect(res.status).toBe(403);
    });

    it('rejects Parent user accessing Admin Finance Summary API with 403 Forbidden', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/finance/summary', {
        headers: { authorization: `Bearer ${parent1SessionToken}` },
      });
      const res = await getFinanceSummary(req);
      expect(res.status).toBe(403);
    });
  });

  describe('Insecure Direct Object Reference (IDOR) Prevention', () => {
    it('rejects Parent 1 attempting to access Child 2 attendance records with 403', async () => {
      const req = new NextRequest(`http://localhost:3000/api/parent/children/${child2Id}/attendance`, {
        headers: { authorization: `Bearer ${parent1SessionToken}` },
      });
      const res = await getChildAttendance(req, { params: Promise.resolve({ id: child2Id }) });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('STUDENT_ACCESS_DENIED');
    });

    it('rejects Parent 1 attempting to access Child 2 financial records with 403', async () => {
      const req = new NextRequest(`http://localhost:3000/api/parent/children/${child2Id}/finance`, {
        headers: { authorization: `Bearer ${parent1SessionToken}` },
      });
      const res = await getChildFinance(req, { params: Promise.resolve({ id: child2Id }) });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('STUDENT_ACCESS_DENIED');
    });

    it('allows Parent 1 to access Child 1 attendance records with 200 OK', async () => {
      const req = new NextRequest(`http://localhost:3000/api/parent/children/${child1Id}/attendance`, {
        headers: { authorization: `Bearer ${parent1SessionToken}` },
      });
      const res = await getChildAttendance(req, { params: Promise.resolve({ id: child1Id }) });
      expect(res.status).toBe(200);
    });
  });

  describe('Teacher Scope & Classroom Boundary Isolation', () => {
    it('rejects Teacher accessing students of an unassigned class with 403 Forbidden', async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/teacher/classes/${unassignedClassId}/students?programmeId=${primaryProgId}`,
        {
          headers: { authorization: `Bearer ${teacherSessionToken}` },
        }
      );
      const res = await getTeacherClassStudents(req, { params: Promise.resolve({ id: unassignedClassId }) });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('SCOPE_UNAUTHORIZED');
    });
  });
});
