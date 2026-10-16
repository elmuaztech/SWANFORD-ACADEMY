import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  AdmissionCycleStatus,
  Gender,
  ProgrammeCode,
  RelationshipType,
  RoleCode,
  TermCode,
} from '@prisma/client';
import {
  createDraftApplication,
  submitApplication,
  reviewProgrammeSelection,
} from '@/lib/admissions/application_service';
import { createAdmissionCycle, setProgrammeAvailability } from '@/lib/admissions/cycle_service';
import { renderOfficialAdmissionLetterEmail } from '@/lib/notifications/templates/catalog';
import { SafeUser } from '@/lib/auth/service';
import { GET } from '@/app/api/admissions/letter/[id]/route';
import { NextRequest } from 'next/server';

describe('Integration & Unit: Admission Letter & Email Corrections Compliance', () => {
  let adminUser: SafeUser;
  let sessionAId: string;
  let sessionBId: string;
  let cycleId: string;
  let primaryProgId: string;

  beforeEach(async () => {
    // Reset any existing active sessions
    await prisma.academicSession.updateMany({
      data: { isCurrent: false },
    });

    // 1. Create Academic Session A (Active)
    const sessionA = await prisma.academicSession.create({
      data: {
        name: `2028/2029-Session-A-${Date.now()}`,
        startDate: new Date('2028-09-01'),
        endDate: new Date('2029-07-31'),
        isCurrent: true,
      },
    });
    sessionAId = sessionA.id;

    await prisma.academicTerm.create({
      data: {
        academicSessionId: sessionA.id,
        termCode: TermCode.FIRST,
        name: 'First Term',
        startDate: new Date('2028-09-01'),
        endDate: new Date('2028-12-15'),
        isCurrent: true,
      },
    });

    // 2. Create Academic Session B (Inactive initially)
    const sessionB = await prisma.academicSession.create({
      data: {
        name: `2029/2030-Session-B-${Date.now()}`,
        startDate: new Date('2029-09-01'),
        endDate: new Date('2030-07-31'),
        isCurrent: false,
      },
    });
    sessionBId = sessionB.id;

    // 3. Super Admin User
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.SUPER_ADMIN } });
    const user = await prisma.user.create({
      data: {
        email: `compliance-admin-${Date.now()}@example.com`,
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
      roles: [RoleCode.SUPER_ADMIN],
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      createdAt: new Date(),
    };

    // 4. Programme & Class
    const primaryProg = await prisma.programme.upsert({
      where: { code: ProgrammeCode.PRIMARY },
      update: {},
      create: {
        code: ProgrammeCode.PRIMARY,
        name: 'Primary Education',
        description: 'Basic primary curriculum',
      },
    });
    primaryProgId = primaryProg.id;

    const schoolClass = await prisma.schoolClass.create({
      data: {
        code: `PRI-COMP-${Date.now()}`,
        name: 'Primary 1A',
        programmeId: primaryProgId,
        capacity: 25,
      },
    });
    void schoolClass;

    // 5. Admission Cycle linked to Session A
    const cycle = await createAdmissionCycle(adminUser, {
      name: `Admission Cycle-${Date.now()}`,
      code: `CYCLE-COMP-${Date.now()}`,
      academicSessionId: sessionAId,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2029-12-31'),
    });
    cycleId = cycle.id;

    await prisma.admissionCycle.update({
      where: { id: cycleId },
      data: { status: AdmissionCycleStatus.OPEN },
    });

    await setProgrammeAvailability(adminUser, cycleId, primaryProgId, { status: 'OPEN' });
  });

  it('email template strictly complies with all content, signatory, and footer requirements', () => {
    const rendered = renderOfficialAdmissionLetterEmail({
      guardianName: 'Ibrahim Dutse',
      applicantName: 'Fatima Ibrahim',
      applicationNumber: 'APP-2028-0012',
      applicantDob: '12 May 2022',
      applicantGender: 'Female',
      programmesList: 'Primary 1A',
      academicSessionName: '2028/2029',
      admissionLetterUrl: 'https://swanfordacademy.edu.ng/admissions/letter/test-id',
    });

    // 1. Subject & Heading
    expect(rendered.subject).toContain('Offer of Admission: Fatima Ibrahim');
    expect(rendered.html).toContain('OFFER OF ADMISSION');
    expect(rendered.html).toContain('Academic Session: 2028/2029');

    // 2. Terminology & Approved Body
    expect(rendered.html).toContain('Dear Mr/Mrs Ibrahim Dutse,');
    expect(rendered.html).toContain('We are pleased to inform you that your child, <strong>Fatima Ibrahim</strong>, has been offered admission into <strong>Swanford Academy</strong> for the <strong>2028/2029</strong> academic session.');
    expect(rendered.html).toContain('We welcome you to our school community and look forward to working together to provide your child with quality education, sound upbringing, good character, and the skills needed for future success.');
    expect(rendered.html).toContain("Please complete the admission requirements outlined below to finalise your child's registration.");

    // 3. Table Labels
    expect(rendered.html).toContain('Class Admitted:');
    expect(rendered.html).toContain('Admission Reference:');

    // 4. Contact Details
    expect(rendered.html).toContain('swanford99@gmail.com');
    expect(rendered.html).not.toContain('info@swanfordacademy.edu.ng');

    // 5. Signatory: Muhammad Kanti ONLY
    expect(rendered.html).toContain('Muhammad Kanti');
    expect(rendered.html).toContain('Director');
    expect(rendered.html).not.toContain('Amina Bello');
    expect(rendered.html).not.toContain('Admissions Committee Secretary');
    expect(rendered.html).not.toContain('Dr. Al-Mansur Ibrahim');

    // 6. Prohibited terminology checks
    expect(rendered.html).not.toContain('Matriculation');
    expect(rendered.html).not.toContain('Academic Faculty');
    expect(rendered.html).not.toContain('OFFICIAL SEAL 2026 VERIFIED');
    expect(rendered.html).not.toContain('Assalamu alaikum');

    // 7. Check plain text version
    expect(rendered.text).toContain('OFFER OF ADMISSION');
    expect(rendered.text).toContain('Academic Session: 2028/2029');
    expect(rendered.text).toContain('swanford99@gmail.com');
    expect(rendered.text).toContain('Muhammad Kanti');
    expect(rendered.text).not.toContain('info@swanfordacademy.edu.ng');
  });

  it('letter API dynamically reflects active academic session and updates when session changes', async () => {
    // Create candidate
    const app = await createDraftApplication({
      admissionCycleId: cycleId,
      applicantFirstName: 'Zainab',
      applicantLastName: 'Bello',
      applicantGender: Gender.FEMALE,
      applicantDob: new Date('2022-03-10'),
      guardianFirstName: 'Bello',
      guardianLastName: 'Umar',
      guardianEmail: `bello.umar.${Date.now()}@example.com`,
      guardianPhone: '+2348031112233',
      guardianRelationship: RelationshipType.FATHER,
      programmeSelections: [{ programmeId: primaryProgId }],
    });

    await submitApplication(app.id);

    const refreshed = await prisma.application.findUniqueOrThrow({
      where: { id: app.id },
      include: { programmeSelections: true },
    });

    // Approve candidate
    await reviewProgrammeSelection(adminUser, refreshed.programmeSelections[0].id, {
      decision: 'APPROVED',
      decisionNotes: 'Meets age and character requirements.',
    });

    // Fetch letter API while Session A is active
    const sessionARecord = await prisma.academicSession.findUniqueOrThrow({ where: { id: sessionAId } });
    const reqA = new NextRequest(`http://localhost/api/admissions/letter/${app.id}`);
    const resA = await GET(reqA, { params: Promise.resolve({ id: app.id }) });
    expect(resA.status).toBe(200);
    const dataA = await resA.json();

    expect(dataA.academicSessionName).toBe(sessionARecord.name);
    expect(dataA.school.email).toBe('swanford99@gmail.com');
    expect(dataA.school.address).toBe('PLOT 212, DR NUHU MUHAMMADU SANUSI WAY, DUTSE, JIGAWA STATE');

    // Now switch active session from Session A to Session B
    await prisma.$transaction([
      prisma.academicSession.update({ where: { id: sessionAId }, data: { isCurrent: false } }),
      prisma.academicSession.update({ where: { id: sessionBId }, data: { isCurrent: true } }),
    ]);

    const sessionBRecord = await prisma.academicSession.findUniqueOrThrow({ where: { id: sessionBId } });

    // Fetch letter API again -> MUST immediately reflect Session B
    const reqB = new NextRequest(`http://localhost/api/admissions/letter/${app.id}`);
    const resB = await GET(reqB, { params: Promise.resolve({ id: app.id }) });
    expect(resB.status).toBe(200);
    const dataB = await resB.json();

    expect(dataB.academicSessionName).toBe(sessionBRecord.name);
    expect(dataB.academicSessionName).not.toBe(sessionARecord.name);
  });

  it('handles scenario when no active session is configured gracefully without fake session fallback', async () => {
    // Deactivate all sessions
    await prisma.academicSession.updateMany({
      data: { isCurrent: false },
    });

    const app = await createDraftApplication({
      admissionCycleId: cycleId,
      applicantFirstName: 'Mustafa',
      applicantLastName: 'Aliyu',
      applicantGender: Gender.MALE,
      applicantDob: new Date('2021-08-15'),
      guardianFirstName: 'Aliyu',
      guardianLastName: 'Mustafa',
      guardianEmail: `aliyu.mustafa.${Date.now()}@example.com`,
      guardianPhone: '+2348034445566',
      guardianRelationship: RelationshipType.FATHER,
      programmeSelections: [{ programmeId: primaryProgId }],
    });

    await submitApplication(app.id);

    const refreshed = await prisma.application.findUniqueOrThrow({
      where: { id: app.id },
      include: { programmeSelections: true },
    });

    await reviewProgrammeSelection(adminUser, refreshed.programmeSelections[0].id, {
      decision: 'APPROVED',
    });

    const req = new NextRequest(`http://localhost/api/admissions/letter/${app.id}`);
    const res = await GET(req, { params: Promise.resolve({ id: app.id }) });
    expect(res.status).toBe(200);
    const data = await res.json();

    // Must clearly state no active session rather than hardcoded 2026/2027
    expect(data.academicSessionName).toBe('No Active Academic Session Configured');
    expect(data.academicSessionName).not.toContain('2026/2027 Academic Session');
  });
});
