import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { GET as getAdminStatus, POST as postAdminStatus } from '@/app/api/admin/admissions/status/route';
import { GET as getPublicAdmissionOptions } from '@/app/api/public/admission-options/route';
import { POST as submitApplication } from '@/app/api/admissions/apply/route';
import { POST as checkApplicationStatus } from '@/app/api/admissions/status/route';
import { NextRequest } from 'next/server';
import { AdmissionCycleStatus, Gender, RelationshipType, RoleCode } from '@prisma/client';
import { generateSecureToken } from '@/lib/auth/tokens';

describe('Integration Tests: Persistent Admission Control & Dynamic Session Enforcement', () => {
  let superAdminCookie: string;
  let teacherCookie: string;
  let activeSessionId: string;
  let activeSessionName: string;
  let primaryProgId: string;
  let testCycleId: string;
  let existingAppNumber: string;
  let existingAppDob: string;

  beforeAll(async () => {
    // 1. Get or create Super Admin
    const superAdmin = await prisma.user.findFirst({
      where: { userRoles: { some: { role: { code: RoleCode.SUPER_ADMIN } } } },
    });
    if (!superAdmin) throw new Error('Super Admin user not found.');

    const suToken = generateSecureToken();
    await prisma.session.create({
      data: {
        userId: superAdmin.id,
        sessionTokenHash: suToken.tokenHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    superAdminCookie = `swanford_session=${suToken.rawToken}`;

    // 2. Get a non-admin (Teacher) to verify authorization rejection
    const teacher = await prisma.user.findFirst({
      where: { userRoles: { some: { role: { code: RoleCode.TEACHER } } } },
    });
    if (teacher) {
      const tToken = generateSecureToken();
      await prisma.session.create({
        data: {
          userId: teacher.id,
          sessionTokenHash: tToken.tokenHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      teacherCookie = `swanford_session=${tToken.rawToken}`;
    }

    // 3. Find active academic session
    const session = await prisma.academicSession.findFirst({
      where: { isCurrent: true },
    });
    if (!session) throw new Error('Active academic session not found.');
    activeSessionId = session.id;
    activeSessionName = session.name;

    // 4. Get programme
    const prog = await prisma.programme.findFirst({ where: { isActive: true } });
    if (!prog) throw new Error('No active programme found.');
    primaryProgId = prog.id;

    // 5. Ensure an admission cycle exists
    let cycle = await prisma.admissionCycle.findFirst({
      where: { academicSessionId: activeSessionId },
    });
    if (!cycle) {
      cycle = await prisma.admissionCycle.create({
        data: {
          academicSessionId: activeSessionId,
          code: `ADM-TEST-${Date.now()}`,
          name: `${activeSessionName} Test Admission`,
          startDate: new Date(),
          endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          status: AdmissionCycleStatus.OPEN,
        },
      });
    }
    testCycleId = cycle.id;

    // 6. Find an existing application for tracking tests
    const existingApp = await prisma.application.findFirst({
      select: { applicationNumber: true, guardianEmail: true },
    });
    if (existingApp) {
      existingAppNumber = existingApp.applicationNumber;
      existingAppDob = existingApp.guardianEmail;
    }
  });

  afterAll(async () => {
    // Restore admissions to OPEN for the active session
    await prisma.admissionCycle.updateMany({
      where: { academicSessionId: activeSessionId },
      data: { status: AdmissionCycleStatus.OPEN },
    });
  });

  it('1. GET /api/admin/admissions/status returns active session and cycle data', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/admissions/status', {
      headers: { cookie: superAdminCookie },
    });
    const res = await getAdminStatus(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.activeSessionName).toBe(activeSessionName);
    expect(data.activeSessionId).toBe(activeSessionId);
    expect(typeof data.isOpen).toBe('boolean');
    expect(Array.isArray(data.allSessions)).toBe(true);
  });

  it('2. Super Admin CLOSES admissions -> persisted in PostgreSQL and reflected publicly', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/admissions/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: superAdminCookie,
      },
      body: JSON.stringify({
        sessionId: activeSessionId,
        action: 'CLOSE',
      }),
    });

    const res = await postAdminStatus(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.isOpen).toBe(false);

    // Verify DB persistence
    const openCycles = await prisma.admissionCycle.count({
      where: {
        academicSessionId: activeSessionId,
        status: AdmissionCycleStatus.OPEN,
      },
    });
    expect(openCycles).toBe(0);

    // Verify Public API reflects CLOSED
    const publicRes = await getPublicAdmissionOptions();
    expect(publicRes.status).toBe(200);
    const publicData = await publicRes.json();
    expect(publicData.isOpen).toBe(false);
    expect(publicData.activeSessionName).toBe(activeSessionName);
    expect(publicData.announcement).toBe(`Admissions for ${activeSessionName} are currently closed.`);
  });

  it('3. When admissions are closed, new application submissions are rejected server-side', async () => {
    const uniqueSuffix = Date.now();
    const payload = {
      admissionCycleId: testCycleId,
      applicantFirstName: 'TestChild',
      applicantLastName: `Closed-${uniqueSuffix}`,
      applicantOtherNames: null,
      applicantGender: Gender.MALE,
      applicantDob: '2020-01-01',
      profilePhotoId: null,

      guardianFirstName: 'TestParent',
      guardianLastName: `Closed-${uniqueSuffix}`,
      guardianEmail: `parent.${uniqueSuffix}@swanford.test`,
      guardianPhone: '08031112233',
      guardianRelationship: RelationshipType.FATHER,

      programmeSelections: [{ programmeId: primaryProgId }],
    };

    const req = new NextRequest('http://localhost:3000/api/admissions/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const res = await submitApplication(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toMatch(/closed/i);
  });

  it('4. When admissions are closed, existing applicants can still track their application status', async () => {
    if (!existingAppNumber || !existingAppDob) {
      return; // Skip if no existing app in test DB
    }

    const req = new NextRequest('http://localhost:3000/api/admissions/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicationNumber: existingAppNumber,
        contactVerification: existingAppDob,
      }),
    });

    const res = await checkApplicationStatus(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.applicationNumber).toBe(existingAppNumber);
  });

  it('5. Super Admin OPENS admissions -> persisted in PostgreSQL and reflected publicly', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/admissions/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: superAdminCookie,
      },
      body: JSON.stringify({
        sessionId: activeSessionId,
        action: 'OPEN',
      }),
    });

    const res = await postAdminStatus(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.isOpen).toBe(true);

    // Verify DB persistence
    const activeCycle = await prisma.admissionCycle.findFirst({
      where: {
        academicSessionId: activeSessionId,
        status: AdmissionCycleStatus.OPEN,
      },
    });
    expect(activeCycle).toBeDefined();
    expect(activeCycle?.status).toBe(AdmissionCycleStatus.OPEN);

    // Verify Public API reflects OPEN
    const publicRes = await getPublicAdmissionOptions();
    expect(publicRes.status).toBe(200);
    const publicData = await publicRes.json();
    expect(publicData.isOpen).toBe(true);
    expect(publicData.activeSessionName).toBe(activeSessionName);
    expect(publicData.announcement).toBe(`Admissions for ${activeSessionName} are now open.`);
  });

  it('6. Unauthorized users cannot toggle admissions status', async () => {
    // Unauthenticated
    const unauthReq = new NextRequest('http://localhost:3000/api/admin/admissions/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'CLOSE' }),
    });
    const unauthRes = await postAdminStatus(unauthReq);
    expect(unauthRes.status).toBe(401);

    // Teacher without ADMISSION_CYCLE_MANAGE
    if (teacherCookie) {
      const teacherReq = new NextRequest('http://localhost:3000/api/admin/admissions/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: teacherCookie,
        },
        body: JSON.stringify({ action: 'CLOSE' }),
      });
      const teacherRes = await postAdminStatus(teacherReq);
      expect(teacherRes.status).toBe(403);
    }
  });

  it('7. Supports boolean isOpen payload format from admin UI', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/admissions/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: superAdminCookie,
      },
      body: JSON.stringify({
        academicSessionId: activeSessionId,
        isOpen: true,
      }),
    });

    const res = await postAdminStatus(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isOpen).toBe(true);
  });
});
