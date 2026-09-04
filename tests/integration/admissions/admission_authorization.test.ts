import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  AdmissionCycleStatus,
  RoleCode,
  ProgrammeCode,
} from '@prisma/client';
import {
  createAdmissionCycle,
  setProgrammeAvailability,
  listAdmissionCycles,
} from '@/lib/admissions/cycle_service';
import {
  confirmApplicationPayment,
  reviewProgrammeSelection,
  listApplications,
} from '@/lib/admissions/application_service';
import { matriculateApplication } from '@/lib/admissions/matriculation_service';
import { SafeUser } from '@/lib/auth/service';

describe('Stage 7 — Integration: Admission RBAC & Centralized Authorization Enforcement', () => {
  let unauthorizedTeacher: SafeUser;
  let academicSessionId: string;
  let primaryProgId: string;

  beforeEach(async () => {
    // 1. Setup Session
    const session = await prisma.academicSession.create({
      data: {
        name: `Auth-Session-${Date.now()}`,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-07-31'),
        isCurrent: true,
      },
    });
    academicSessionId = session.id;

    // 2. Setup Teacher User (Does NOT have ADMISSION_CYCLE_MANAGE or ADMISSION_APPLICATION_APPROVE)
    const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.TEACHER } });
    const user = await prisma.user.create({
      data: {
        email: `teacher-unauth-${Date.now()}@example.com`,
        passwordHash: 'dummy-hash',
        status: 'ACTIVE',
      },
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: teacherRole.id },
    });

    unauthorizedTeacher = {
      id: user.id,
      email: user.email,
      phoneNumber: null,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      createdAt: new Date(),
    };

    const primaryProg = await prisma.programme.findUniqueOrThrow({
      where: { code: ProgrammeCode.PRIMARY },
    });
    primaryProgId = primaryProg.id;
  });

  it('rejects unauthorized users from creating admission cycles', async () => {
    await expect(
      createAdmissionCycle(unauthorizedTeacher, {
        academicSessionId,
        code: `ADM-FAIL-${Date.now()}`,
        name: 'Unauthorized Cycle',
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-09-30'),
        status: AdmissionCycleStatus.UPCOMING,
      })
    ).rejects.toThrow('Missing required permission');
  });

  it('rejects unauthorized users from setting programme availability or capacity', async () => {
    await expect(
      setProgrammeAvailability(unauthorizedTeacher, '00000000-0000-0000-0000-000000000001', primaryProgId, {
        status: 'OPEN',
      })
    ).rejects.toThrow('Missing required permission');
  });

  it('rejects unauthorized users from listing applications or cycles', async () => {
    await expect(listAdmissionCycles(unauthorizedTeacher)).rejects.toThrow('Missing required permission');
    await expect(listApplications(unauthorizedTeacher)).rejects.toThrow('Missing required permission');
  });

  it('rejects unauthorized users from confirming application payments', async () => {
    await expect(
      confirmApplicationPayment(unauthorizedTeacher, '00000000-0000-0000-0000-000000000001', {
        paymentReference: 'FAKE-REF',
        amountPaidKobo: BigInt(500000),
      })
    ).rejects.toThrow('Missing required permission');
  });

  it('rejects unauthorized users from reviewing selections or matriculating students', async () => {
    await expect(
      reviewProgrammeSelection(unauthorizedTeacher, '00000000-0000-0000-0000-000000000001', {
        decision: 'APPROVED',
      })
    ).rejects.toThrow('Missing required permission');

    await expect(
      matriculateApplication(unauthorizedTeacher, {
        applicationId: '00000000-0000-0000-0000-000000000001',
      })
    ).rejects.toThrow('Missing required permission');
  });
});
