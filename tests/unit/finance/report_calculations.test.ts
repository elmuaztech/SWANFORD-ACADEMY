import { describe, it, expect } from 'vitest';
import { computeOutstandingBalance, sumKoboBigInt } from '@/lib/money';

describe('Stage 8 — Unit: Financial Math & Calculations in Kobo', () => {
  it('correctly calculates total invoice amount from itemized components using integer Kobo', () => {
    const tuitionKobo = BigInt(7500000); // ₦75,000
    const uniformKobo = BigInt(1800000); // ₦18,000
    const booksKobo = BigInt(1200000);   // ₦12,000

    const totalKobo = sumKoboBigInt(tuitionKobo, uniformKobo, booksKobo);
    expect(totalKobo).toBe(BigInt(10500000)); // ₦105,000
  });

  it('computes exact outstanding balance across partial installments', () => {
    const invoiceTotal = BigInt(10500000);
    const firstPayment = BigInt(4000000);
    const secondPayment = BigInt(3500000);

    const balanceAfterP1 = computeOutstandingBalance(invoiceTotal, firstPayment);
    expect(balanceAfterP1).toBe(BigInt(6500000));

    const totalPaid = firstPayment + secondPayment;
    const balanceAfterP2 = computeOutstandingBalance(invoiceTotal, totalPaid);
    expect(balanceAfterP2).toBe(BigInt(3000000));

    const finalPayment = BigInt(3000000);
    const balanceFinal = computeOutstandingBalance(invoiceTotal, totalPaid + finalPayment);
    expect(balanceFinal).toBe(BigInt(0));
  });

  it('computes fee collection rate percentage accurately with 2 decimal precision', () => {
    const totalInvoiced = BigInt(10000000); // ₦100,000
    const totalCollected = BigInt(7550000); // ₦75,500

    const rate = Number((totalCollected * BigInt(10000)) / totalInvoiced) / 100;
    expect(rate).toBe(75.5);
  });
});
