import { describe, it, expect } from 'vitest';
import {
  generatePaystackReference,
  parsePaystackReference,
  isValidPaystackReference,
  isValidSwanfordReference,
} from '@/lib/paystack/reference';
import { PaymentTargetType } from '@prisma/client';

describe('Stage 9 — Unit: Paystack Reference Engine', () => {
  it('generates compliant reference for APPLICATION_FEE target', () => {
    const appId = 'app_cuid1234567890';
    const ref = generatePaystackReference(PaymentTargetType.APPLICATION_FEE, appId);

    expect(ref).toMatch(/^SWN-APP-[a-zA-Z0-9_-]+-[A-Z0-9]+-[A-Z0-9]+$/);
    expect(isValidPaystackReference(ref)).toBe(true);
    expect(isValidSwanfordReference(ref)).toBe(true);

    const parsed = parsePaystackReference(ref);
    expect(parsed).not.toBeNull();
    expect(parsed?.targetType).toBe(PaymentTargetType.APPLICATION_FEE);
    expect(parsed?.targetId).toBe(appId);
  });

  it('generates compliant reference for INVOICE target', () => {
    const invId = 'inv_cuid9876543210';
    const ref = generatePaystackReference(PaymentTargetType.INVOICE, invId);

    expect(ref).toMatch(/^SWN-INV-[a-zA-Z0-9_-]+-[A-Z0-9]+-[A-Z0-9]+$/);
    expect(isValidPaystackReference(ref)).toBe(true);
    expect(isValidSwanfordReference(ref)).toBe(true);

    const parsed = parsePaystackReference(ref);
    expect(parsed).not.toBeNull();
    expect(parsed?.targetType).toBe(PaymentTargetType.INVOICE);
    expect(parsed?.targetId).toBe(invId);
  });

  it('guarantees uniqueness across thousands of rapid generations', () => {
    const targetId = 'app-bulk-test-123';
    const count = 2000;
    const set = new Set<string>();

    for (let i = 0; i < count; i++) {
      const ref = generatePaystackReference(PaymentTargetType.APPLICATION_FEE, targetId);
      set.add(ref);
    }

    expect(set.size).toBe(count);
  });

  it('rejects invalid or malformed references', () => {
    expect(isValidPaystackReference('')).toBe(false);
    expect(isValidPaystackReference('short')).toBe(false); // under 10 chars
    expect(isValidSwanfordReference('INVALID-REF')).toBe(false);
    expect(isValidSwanfordReference('SWN-UNKNOWN-123-ABC')).toBe(false);
    expect(isValidSwanfordReference('')).toBe(false);
    expect(isValidSwanfordReference('SWN-APP-')).toBe(false);

    expect(parsePaystackReference('INVALID-REF')).toBeNull();
    expect(parsePaystackReference('SWN-UNKNOWN-123-ABC')).toBeNull();
  });
});
