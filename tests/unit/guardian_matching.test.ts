import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { matchExistingGuardian } from '@/lib/guardians/guardian_matching';

describe('Stage 6 — Unit: Conservative Guardian Matching', () => {
  const testEmail = 'farouk.bello@example.com';
  const testPhone = '+2348031234567';

  beforeEach(async () => {
    await prisma.guardian.deleteMany({
      where: {
        email: { in: [testEmail, 'other.bello@example.com'] },
      },
    });
  });

  it('matches existing guardian with verified exact email (case-insensitive & trimmed)', async () => {
    const existing = await prisma.guardian.create({
      data: {
        firstName: 'Farouk',
        lastName: 'Bello',
        email: testEmail,
        phonePrimary: testPhone,
      },
    });

    const result = await matchExistingGuardian({
      firstName: 'Farouk',
      lastName: 'Bello',
      email: '  FAROUK.BELLO@EXAMPLE.COM  ',
      phonePrimary: testPhone,
    });

    expect(result.matchType).toBe('EXACT_EMAIL_MATCH');
    expect(result.matchedGuardianId).toBe(existing.id);
    expect(result.hasConflict).toBe(false);

    // Clean up
    await prisma.guardian.delete({ where: { id: existing.id } });
  });

  it('detects conflict and refuses auto-merge when same name and phone match but email differs', async () => {
    const existing = await prisma.guardian.create({
      data: {
        firstName: 'Farouk',
        lastName: 'Bello',
        email: testEmail,
        phonePrimary: testPhone,
      },
    });

    const result = await matchExistingGuardian({
      firstName: 'Farouk',
      lastName: 'Bello',
      email: 'other.bello@example.com',
      phonePrimary: testPhone,
    });

    expect(result.matchType).toBe('NONE');
    expect(result.hasConflict).toBe(true);
    expect(result.matchedGuardianId).toBeNull();
    expect(result.conflictReason).toContain('Another guardian record exists with the same primary phone');

    // Clean up
    await prisma.guardian.delete({ where: { id: existing.id } });
  });

  it('returns NONE when no email and distinct phone or name is supplied', async () => {
    const result = await matchExistingGuardian({
      firstName: 'Ibrahim',
      lastName: 'Danjuma',
      phonePrimary: '+2348099999999',
    });

    expect(result.matchType).toBe('NONE');
    expect(result.hasConflict).toBe(false);
    expect(result.matchedGuardianId).toBeNull();
  });
});
