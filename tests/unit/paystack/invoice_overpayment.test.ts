import { describe, it, expect } from 'vitest';
import {
  computeOutstandingBalance,
  nairaToKoboBigInt,
  sumKoboBigInt,
} from '@/lib/money';

describe('Stage 9 — Unit: Invoice Overpayment & Arithmetic Invariants', () => {
  it('correctly calculates outstanding balance for multi-item invoices', () => {
    const tuition = nairaToKoboBigInt('150000'); // ₦150,000
    const books = nairaToKoboBigInt('30000');    // ₦30,000
    const uniform = nairaToKoboBigInt('20000');  // ₦20,000
    const totalInvoice = sumKoboBigInt(tuition, books, uniform); // ₦200,000

    expect(totalInvoice).toBe(BigInt(20000000));

    // Initially 0 paid
    let paid = BigInt(0);
    expect(computeOutstandingBalance(totalInvoice, paid)).toBe(BigInt(20000000));

    // First partial installment: ₦75,000
    const part1 = nairaToKoboBigInt('75000');
    paid = sumKoboBigInt(paid, part1);
    expect(computeOutstandingBalance(totalInvoice, paid)).toBe(BigInt(12500000));

    // Second installment: ₦125,000 (Exact balance)
    const part2 = nairaToKoboBigInt('125000');
    paid = sumKoboBigInt(paid, part2);
    expect(computeOutstandingBalance(totalInvoice, paid)).toBe(BigInt(0));
  });

  it('detects and flags overpayment attempts with precision', () => {
    const totalInvoice = nairaToKoboBigInt('100000'); // ₦100,000
    const paid = nairaToKoboBigInt('80000');          // ₦80,000 already paid
    const outstanding = computeOutstandingBalance(totalInvoice, paid); // ₦20,000 remaining

    const paymentAttempt = nairaToKoboBigInt('25000'); // ₦25,000 attempted (₦5,000 overpayment)

    const isOverpayment = paymentAttempt > outstanding;
    expect(isOverpayment).toBe(true);

    const excessAmount = paymentAttempt - outstanding;
    expect(excessAmount).toBe(nairaToKoboBigInt('5000'));
  });

  it('prevents negative balance states via overpayment validation guard', () => {
    const total = BigInt(5000000); // ₦50,000
    const overpaid = BigInt(6000000); // ₦60,000

    // computeOutstandingBalance calculates exact signed difference:
    const diff = computeOutstandingBalance(total, overpaid);
    expect(diff).toBe(BigInt(-1000000));

    // The business rule: if paymentAmount > currentOutstanding, it must be rejected
    const currentPaid = BigInt(0);
    const outstanding = computeOutstandingBalance(total, currentPaid);
    const validatePayment = (amount: bigint) => {
      if (amount > outstanding) {
        throw new Error("Payment exceeds outstanding balance.");
      }
      return computeOutstandingBalance(outstanding, amount);
    };

    expect(() => validatePayment(overpaid)).toThrow("Payment exceeds outstanding balance.");
    expect(validatePayment(total)).toBe(BigInt(0));
  });
});
