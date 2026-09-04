import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { AdmissionCycleStatus, ProgrammeAvailabilityStatus, RoleCode, ProgrammeCode } from '@prisma/client';
import {
  createAdmissionCycle,
  updateAdmissionCycle,
  setProgrammeAvailability,
  getActiveAdmissionCycle,
  getAdmissionCycleById,
} from '@/lib/admissions/cycle_service';
import { SafeUser } from '@/lib/auth/service';

describe('Stage 7 — Integration: Admission Cycles & Programme Availabilities', () => {
  let adminUser: SafeUser;
  let academicSessionId: string;
  let primaryProgId: string;

  beforeEach(async () => {
    // 1. Setup Session
    const session = await prisma.academicSession.create({
      data: {
        name: `Cycle-Test-Session-${Date.now()}`,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-07-31'),
        isCurrent: true,
      },
    });
    academicSessionId = session.id;

    // 2. Setup Super Admin
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.SUPER_ADMIN } });
    const user = await prisma.user.create({
      data: {
        email: `cycle-admin-${Date.now()}@example.com`,
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

    const primaryProg = await prisma.programme.findUniqueOrThrow({
      where: { code: ProgrammeCode.PRIMARY },
    });
    primaryProgId = primaryProg.id;
  });

  it('creates an admission cycle and auto-initializes availabilities for active programmes', async () => {
    const cycle = await createAdmissionCycle(adminUser, {
      academicSessionId,
      code: `ADM-TEST-${Date.now()}`,
      name: 'Test 2026 Intake',
      startDate: new Date('2026-08-01T08:00:00.000Z'),
      endDate: new Date('2026-09-30T23:59:59.000Z'),
      status: AdmissionCycleStatus.OPEN,
    });

    expect(cycle).toBeDefined();
    expect(cycle.status).toBe(AdmissionCycleStatus.OPEN);

    // Verify programme availabilities were initialized
    const fetched = await getAdmissionCycleById(cycle.id);
    expect(fetched.programmeAvailabilities.length).toBeGreaterThan(0);
    const primaryAvail = fetched.programmeAvailabilities.find((p) => p.programmeId === primaryProgId);
    expect(primaryAvail).toBeDefined();
    expect(primaryAvail?.status).toBe(ProgrammeAvailabilityStatus.OPEN);
  });

  it('rejects creation when startDate is chronologically after or equal to endDate', async () => {
    await expect(
      createAdmissionCycle(adminUser, {
        academicSessionId,
        code: `ADM-INVALID-${Date.now()}`,
        name: 'Invalid Chronology Cycle',
        startDate: new Date('2026-10-01'),
        endDate: new Date('2026-09-01'), // Earlier than start!
      })
    ).rejects.toThrow('must be chronologically before endDate');
  });

  it('enforces forward lifecycle transitions and blocks illegal backward regressions', async () => {
    const cycle = await createAdmissionCycle(adminUser, {
      academicSessionId,
      code: `ADM-FLOW-${Date.now()}`,
      name: 'Lifecycle Flow Test',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-09-30'),
      status: AdmissionCycleStatus.UPCOMING,
    });

    // UPCOMING -> OPEN is valid
    const openCycle = await updateAdmissionCycle(adminUser, cycle.id, {
      status: AdmissionCycleStatus.OPEN,
    });
    expect(openCycle.status).toBe(AdmissionCycleStatus.OPEN);

    // OPEN -> CLOSED is valid
    const closedCycle = await updateAdmissionCycle(adminUser, cycle.id, {
      status: AdmissionCycleStatus.CLOSED,
    });
    expect(closedCycle.status).toBe(AdmissionCycleStatus.CLOSED);

    // CLOSED -> ARCHIVED is valid
    const archivedCycle = await updateAdmissionCycle(adminUser, cycle.id, {
      status: AdmissionCycleStatus.ARCHIVED,
    });
    expect(archivedCycle.status).toBe(AdmissionCycleStatus.ARCHIVED);

    // ARCHIVED -> OPEN is strictly illegal (Terminal state)
    await expect(
      updateAdmissionCycle(adminUser, cycle.id, {
        status: AdmissionCycleStatus.OPEN,
      })
    ).rejects.toThrow('Invalid admission cycle status transition');
  });

  it('sets programme capacity quota and updates availability status', async () => {
    const cycle = await createAdmissionCycle(adminUser, {
      academicSessionId,
      code: `ADM-CAP-${Date.now()}`,
      name: 'Capacity Test Cycle',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-09-30'),
      status: AdmissionCycleStatus.OPEN,
    });

    const updated = await setProgrammeAvailability(adminUser, cycle.id, primaryProgId, {
      status: ProgrammeAvailabilityStatus.OPEN,
      maxCapacity: 50,
      notes: 'Max 50 new primary students allowed',
    });

    expect(updated.maxCapacity).toBe(50);
    expect(updated.status).toBe(ProgrammeAvailabilityStatus.OPEN);
  });

  it('evaluates active admission cycle correctly with Africa/Lagos time window', async () => {
    await createAdmissionCycle(adminUser, {
      academicSessionId,
      code: `ADM-PAST-${Date.now()}`,
      name: 'Past Cycle',
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-02-01'),
      status: AdmissionCycleStatus.OPEN,
    });

    const activeCycle = await createAdmissionCycle(adminUser, {
      academicSessionId,
      code: `ADM-ACTIVE-${Date.now()}`,
      name: 'Current Active Cycle',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      status: AdmissionCycleStatus.OPEN,
    });

    // Check at test date 2026-06-15 (inside active cycle, outside past cycle)
    const active = await getActiveAdmissionCycle(new Date('2026-06-15T12:00:00Z'));
    expect(active).toBeDefined();
    expect(active?.cycle.id).toBe(activeCycle.id);
  });
});
