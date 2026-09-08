import { describe, it, expect } from 'vitest';
import {
  formatInvoiceNumber,
  formatPaymentReference,
  formatReceiptNumber,
  formatExpenseNumber,
} from '@/lib/finance/sequences';

describe('Stage 8 — Unit: Financial Sequence Formatters', () => {
  it('formats invoice numbers with INV-YYYY-NNNNN pattern (5 digits)', () => {
    expect(formatInvoiceNumber(2026, 1)).toBe('INV-2026-00001');
    expect(formatInvoiceNumber(2026, 42)).toBe('INV-2026-00042');
    expect(formatInvoiceNumber(2027, 99999)).toBe('INV-2027-99999');
  });

  it('formats payment references with PAY-YYYY-NNNNN pattern (5 digits)', () => {
    expect(formatPaymentReference(2026, 1)).toBe('PAY-2026-00001');
    expect(formatPaymentReference(2026, 305)).toBe('PAY-2026-00305');
  });

  it('formats receipt numbers with REC-YYYY-NNNNN pattern (5 digits)', () => {
    expect(formatReceiptNumber(2026, 1)).toBe('REC-2026-00001');
    expect(formatReceiptNumber(2026, 1234)).toBe('REC-2026-01234');
  });

  it('formats expense voucher numbers with EXP-YYYY-NNNNN pattern (5 digits)', () => {
    expect(formatExpenseNumber(2026, 1)).toBe('EXP-2026-00001');
    expect(formatExpenseNumber(2026, 7)).toBe('EXP-2026-00007');
  });
});
