import { describe, it, expect } from 'vitest';
import { createPaymentSession } from '@/lib/paystack/session';
import { PaymentTargetType } from '@prisma/client';
import { AuthorizationError } from '@/lib/auth/authorization';

describe('Stage 9 — Unit: PaymentSession Business Rules', () => {
  it('throws AuthorizationError when APPLICATION_FEE target is missing applicationId', async () => {
    await expect(
      createPaymentSession({
        targetType: PaymentTargetType.APPLICATION_FEE,
        applicationId: null,
        payerEmail: 'parent@example.com',
        expectedAmountKobo: BigInt(500000),
      })
    ).rejects.toThrow(AuthorizationError);
  });

  it('throws AuthorizationError when APPLICATION_FEE target provides an invoiceId', async () => {
    await expect(
      createPaymentSession({
        targetType: PaymentTargetType.APPLICATION_FEE,
        applicationId: 'app-123',
        invoiceId: 'inv-456',
        payerEmail: 'parent@example.com',
        expectedAmountKobo: BigInt(500000),
      })
    ).rejects.toThrow(AuthorizationError);
  });

  it('throws AuthorizationError when INVOICE target is missing invoiceId', async () => {
    await expect(
      createPaymentSession({
        targetType: PaymentTargetType.INVOICE,
        invoiceId: null,
        payerEmail: 'parent@example.com',
        expectedAmountKobo: BigInt(500000),
      })
    ).rejects.toThrow(AuthorizationError);
  });

  it('throws AuthorizationError when INVOICE target provides an applicationId', async () => {
    await expect(
      createPaymentSession({
        targetType: PaymentTargetType.INVOICE,
        invoiceId: 'inv-123',
        applicationId: 'app-456',
        payerEmail: 'parent@example.com',
        expectedAmountKobo: BigInt(500000),
      })
    ).rejects.toThrow(AuthorizationError);
  });

  it('throws AuthorizationError when expectedAmountKobo is zero or negative', async () => {
    await expect(
      createPaymentSession({
        targetType: PaymentTargetType.APPLICATION_FEE,
        applicationId: 'app-123',
        payerEmail: 'parent@example.com',
        expectedAmountKobo: BigInt(0),
      })
    ).rejects.toThrow(AuthorizationError);

    await expect(
      createPaymentSession({
        targetType: PaymentTargetType.INVOICE,
        invoiceId: 'inv-123',
        payerEmail: 'parent@example.com',
        expectedAmountKobo: BigInt(-5000),
      })
    ).rejects.toThrow(AuthorizationError);
  });
});
