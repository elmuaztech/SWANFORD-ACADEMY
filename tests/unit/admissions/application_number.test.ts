import { describe, it, expect } from 'vitest';
import {
  formatApplicationNumber,
  generateNextApplicationNumber,
  reserveApplicationNumberBlock,
} from '@/lib/admissions/application_number';
import { formatAdmissionNumber } from '@/lib/students/admission_number';

describe('Stage 7 — Unit: Application Number Generator & Sequence Isolation', () => {
  it('formats application numbers to the canonical APP-YYYY-NNNN standard with 4 digits', () => {
    expect(formatApplicationNumber(2026, 1)).toBe('APP-2026-0001');
    expect(formatApplicationNumber(2026, 42)).toBe('APP-2026-0042');
    expect(formatApplicationNumber(2027, 999)).toBe('APP-2027-0999');
    expect(formatApplicationNumber(2026, 10000)).toBe('APP-2026-10000');
  });

  it('keeps application numbers (APP-YYYY-NNNN) strictly separated from student numbers (SA-YYYY-NNNN)', () => {
    const appNum = formatApplicationNumber(2026, 5);
    const stuNum = formatAdmissionNumber(2026, 5);

    expect(appNum).toBe('APP-2026-0005');
    expect(stuNum).toBe('SA-2026-0005');
    expect(appNum).not.toBe(stuNum);
  });

  it('atomically reserves sequential application number blocks', async () => {
    const testYear = 2088; // Isolated test year
    const block1 = await reserveApplicationNumberBlock(3, testYear);
    expect(block1).toHaveLength(3);
    expect(block1[0]).toBe('APP-2088-0001');
    expect(block1[1]).toBe('APP-2088-0002');
    expect(block1[2]).toBe('APP-2088-0003');

    const nextSingle = await generateNextApplicationNumber(testYear);
    expect(nextSingle).toBe('APP-2088-0004');

    const block2 = await reserveApplicationNumberBlock(2, testYear);
    expect(block2).toHaveLength(2);
    expect(block2[0]).toBe('APP-2088-0005');
    expect(block2[1]).toBe('APP-2088-0006');
  });

  it('returns empty array when reserving zero or negative count', async () => {
    const block = await reserveApplicationNumberBlock(0, 2026);
    expect(block).toEqual([]);
  });
});
