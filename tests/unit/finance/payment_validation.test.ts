import { describe, it, expect } from 'vitest';
import { RecordManualPaymentSchema } from '@/lib/finance/payment_service';
import { PaymentMethod } from '@prisma/client';

describe('Stage 8 — Unit: Payment Validation & Schema Rules', () => {
  it('validates a correct manual bank transfer payment payload', () => {
    const valid = RecordManualPaymentSchema.parse({
      invoiceId: 'a0000000-0000-4000-8000-000000000001',
      amountKobo: 5000000,
      paymentMethod: PaymentMethod.BANK_TRANSFER,
      bankReference: 'TRF/2026/09/882103',
      bankName: 'Jaiz Bank',
      idempotencyKey: 'idem-test-12345',
      notes: 'Initial tuition deposit',
    });

    expect(valid.amountKobo).toBe(5000000);
    expect(valid.paymentMethod).toBe(PaymentMethod.BANK_TRANSFER);
    expect(valid.bankReference).toBe('TRF/2026/09/882103');
  });

  it('rejects payment with 0 or negative kobo', () => {
    expect(() =>
      RecordManualPaymentSchema.parse({
        invoiceId: 'a0000000-0000-4000-8000-000000000001',
        amountKobo: 0,
        paymentMethod: PaymentMethod.CASH,
      })
    ).toThrow();

    expect(() =>
      RecordManualPaymentSchema.parse({
        invoiceId: 'a0000000-0000-4000-8000-000000000001',
        amountKobo: -50000,
        paymentMethod: PaymentMethod.CASH,
      })
    ).toThrow();
  });

  it('validates itemized allocation schema inside payment input', () => {
    const valid = RecordManualPaymentSchema.parse({
      invoiceId: 'a0000000-0000-4000-8000-000000000001',
      amountKobo: 3000000,
      paymentMethod: PaymentMethod.POS,
      allocations: [
        {
          invoiceItemId: 'a0000000-0000-4000-8000-000000000002',
          amountKobo: 2000000,
        },
        {
          invoiceItemId: 'a0000000-0000-4000-8000-000000000003',
          amountKobo: 1000000,
        },
      ],
    });

    expect(valid.allocations).toHaveLength(2);
  });
});
