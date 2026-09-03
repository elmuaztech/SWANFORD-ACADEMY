import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  formatAdmissionNumber,
  generateNextAdmissionNumber,
  reserveAdmissionNumberBlock,
} from '@/lib/students/admission_number';

describe('Admission Number Sequencing Tests', () => {
  const testYear = 2099; // Dedicated future test year to prevent collision with actual data

  beforeAll(async () => {
    // Clean up test sequence
    await prisma.admissionNumberSequence.deleteMany({
      where: { year: testYear },
    });
  });

  it('formats numbers into canonical SA-YYYY-NNNN format', () => {
    expect(formatAdmissionNumber(2026, 1)).toBe('SA-2026-0001');
    expect(formatAdmissionNumber(2026, 42)).toBe('SA-2026-0042');
    expect(formatAdmissionNumber(2026, 1234)).toBe('SA-2026-1234');
  });

  it('generates sequential admission numbers starting from 1', async () => {
    const num1 = await generateNextAdmissionNumber(testYear);
    expect(num1).toBe(`SA-${testYear}-0001`);

    const num2 = await generateNextAdmissionNumber(testYear);
    expect(num2).toBe(`SA-${testYear}-0002`);

    const num3 = await generateNextAdmissionNumber(testYear);
    expect(num3).toBe(`SA-${testYear}-0003`);
  });

  it('atomically reserves a block of sequential numbers (bulk intake)', async () => {
    const block = await reserveAdmissionNumberBlock(10, testYear);

    expect(block).toHaveLength(10);
    expect(block[0]).toBe(`SA-${testYear}-0004`);
    expect(block[9]).toBe(`SA-${testYear}-0013`);

    // The very next single call should continue from 14
    const nextNum = await generateNextAdmissionNumber(testYear);
    expect(nextNum).toBe(`SA-${testYear}-0014`);
  });

  it('remains concurrency-safe under simultaneous parallel requests without collisions', async () => {
    const concurrencyCount = 15;

    // Fire 15 concurrent promises simultaneously
    const promises = Array.from({ length: concurrencyCount }, () =>
      generateNextAdmissionNumber(testYear)
    );

    const results = await Promise.all(promises);

    // Verify all generated numbers are unique
    const uniqueSet = new Set(results);
    expect(uniqueSet.size).toBe(concurrencyCount);

    // Verify format for every item
    for (const num of results) {
      expect(num).toMatch(new RegExp(`^SA-${testYear}-\\d{4}$`));
    }
  });

  it('permits gaps without breaking future generation or recycling numbers', async () => {
    // Reserve a block of 5 numbers
    const block = await reserveAdmissionNumberBlock(5, testYear);
    // Simulate rows 1 and 3 failing; only rows 0, 2, 4 are "used"
    const usedNumbers = [block[0], block[2], block[4]];
    const discardedNumbers = [block[1], block[3]];

    expect(discardedNumbers).toHaveLength(2);

    // Next generation continues forward and does NOT recycle discarded numbers
    const subsequent = await generateNextAdmissionNumber(testYear);
    expect(usedNumbers).not.toContain(subsequent);
    expect(discardedNumbers).not.toContain(subsequent);
  });
});
