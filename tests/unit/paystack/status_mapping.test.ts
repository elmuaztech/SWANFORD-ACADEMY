import { describe, it, expect } from 'vitest';
import { mapPaystackStatus, isSuccessfulPaystackStatus } from '@/lib/paystack/types';
import { GatewayTransactionStatus } from '@prisma/client';

describe('Stage 9 — Unit: Paystack Status Mapping Engine', () => {
  it('maps all 8 standard Paystack statuses accurately', () => {
    expect(mapPaystackStatus('success')).toBe(GatewayTransactionStatus.SUCCESS);
    expect(mapPaystackStatus('failed')).toBe(GatewayTransactionStatus.FAILED);
    expect(mapPaystackStatus('abandoned')).toBe(GatewayTransactionStatus.ABANDONED);
    expect(mapPaystackStatus('ongoing')).toBe(GatewayTransactionStatus.ONGOING);
    expect(mapPaystackStatus('pending')).toBe(GatewayTransactionStatus.PENDING);
    expect(mapPaystackStatus('processing')).toBe(GatewayTransactionStatus.PROCESSING);
    expect(mapPaystackStatus('queued')).toBe(GatewayTransactionStatus.QUEUED);
    expect(mapPaystackStatus('reversed')).toBe(GatewayTransactionStatus.REVERSED);
  });

  it('normalizes case variations and surrounding whitespace', () => {
    expect(mapPaystackStatus('  SUCCESS  ')).toBe(GatewayTransactionStatus.SUCCESS);
    expect(mapPaystackStatus('Success')).toBe(GatewayTransactionStatus.SUCCESS);
    expect(mapPaystackStatus('FAILED')).toBe(GatewayTransactionStatus.FAILED);
    expect(mapPaystackStatus('Abandoned ')).toBe(GatewayTransactionStatus.ABANDONED);
    expect(mapPaystackStatus(' Pending')).toBe(GatewayTransactionStatus.PENDING);
    expect(mapPaystackStatus('Reversed')).toBe(GatewayTransactionStatus.REVERSED);
  });

  it('CRITICAL RULE: Never maps unknown, invalid, or falsy statuses to SUCCESS', () => {
    const dangerousInputs = [
      'unknown',
      'custom_gateway_ok',
      'paid_unverified',
      'completed', // Paystack uses 'success', not 'completed'
      'approved',
      '',
      '   ',
      null,
      undefined,
      123,
      {},
      ['success'],
      'success_fake',
    ];

    for (const input of dangerousInputs) {
      const mapped = mapPaystackStatus(input);
      expect(mapped).not.toBe(GatewayTransactionStatus.SUCCESS);
      expect(mapped).toBe(GatewayTransactionStatus.FAILED);
      expect(isSuccessfulPaystackStatus(input)).toBe(false);
    }
  });

  it('correctly validates isSuccessfulPaystackStatus helper', () => {
    expect(isSuccessfulPaystackStatus('success')).toBe(true);
    expect(isSuccessfulPaystackStatus('SUCCESS')).toBe(true);
    expect(isSuccessfulPaystackStatus('  success  ')).toBe(true);

    expect(isSuccessfulPaystackStatus('pending')).toBe(false);
    expect(isSuccessfulPaystackStatus('ongoing')).toBe(false);
    expect(isSuccessfulPaystackStatus('processing')).toBe(false);
    expect(isSuccessfulPaystackStatus('queued')).toBe(false);
    expect(isSuccessfulPaystackStatus('abandoned')).toBe(false);
    expect(isSuccessfulPaystackStatus('failed')).toBe(false);
    expect(isSuccessfulPaystackStatus('reversed')).toBe(false);
  });
});
