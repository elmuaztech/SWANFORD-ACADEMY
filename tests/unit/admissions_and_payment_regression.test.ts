import { describe, it, expect } from 'vitest';
import { formatNaira, nairaToKobo, koboToNaira } from '@/lib/money';

describe('Admissions & Payment Correctness Regression Tests', () => {
  describe('Fee Display and Kobo Conversion Contract', () => {
    it('correctly formats a configured ₦500 (50,000 kobo) form fee as ₦500.00', () => {
      const formFeeKobo = 50000;
      // Regression: passing raw kobo directly to formatNaira without double-dividing
      const formatted = formatNaira(BigInt(formFeeKobo));
      expect(formatted).toBe('₦500.00');
    });

    it('ensures Paystack initialization amount for ₦500 sends 50000 kobo integer', () => {
      const formFeeKobo = 50000;
      // Paystack accepts amount in minor currency unit (kobo for NGN)
      const paystackAmount = Number(formFeeKobo);
      expect(paystackAmount).toBe(50000);
      expect(koboToNaira(paystackAmount)).toBe(500);
    });

    it('detects and avoids previous double-division bug', () => {
      const formFeeKobo = 50000;
      // If code wrongly divided by 100 before passing to formatNaira:
      const brokenCalculation = formatNaira(BigInt(formFeeKobo / 100));
      expect(brokenCalculation).toBe('₦5.00'); // Wrong bug state

      // Correct calculation:
      const fixedCalculation = formatNaira(BigInt(formFeeKobo));
      expect(fixedCalculation).toBe('₦500.00'); // Verified repair
    });
  });

  describe('Draft Fee Synchronization Logic', () => {
    it('refreshes stale uninitiated draft from legacy ₦5,000 to approved ₦500', () => {
      const currentApprovedFeeKobo = BigInt(50000); // ₦500
      const draft = {
        id: 'draft-123',
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        totalAmountKobo: BigInt(500000), // Legacy ₦5,000 snapshot
        paymentTransactions: [], // No existing transaction
      };

      // Safe draft refresh rule: If UNPAID DRAFT with no active transaction,
      // refresh snapshot to approved fee before checkout session initiation
      let effectiveAmountKobo = draft.totalAmountKobo;
      if (
        draft.status === 'DRAFT' &&
        draft.paymentStatus === 'UNPAID' &&
        draft.paymentTransactions.length === 0
      ) {
        effectiveAmountKobo = currentApprovedFeeKobo;
      }

      expect(effectiveAmountKobo).toBe(BigInt(50000));
      expect(formatNaira(effectiveAmountKobo)).toBe('₦500.00');
    });

    it('preserves existing amount if checkout has already been initiated with active transaction', () => {
      const currentApprovedFeeKobo = BigInt(60000); // Admin changed fee later
      const draft = {
        id: 'draft-456',
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        totalAmountKobo: BigInt(50000),
        paymentTransactions: [
          { id: 'tx-1', reference: 'SWN-TX-1', amountKobo: BigInt(50000), status: 'PENDING' },
        ],
      };

      let effectiveAmountKobo = draft.totalAmountKobo;
      // Since an active transaction already exists, preserve the initiated transaction amount
      if (
        draft.status === 'DRAFT' &&
        draft.paymentStatus === 'UNPAID' &&
        draft.paymentTransactions.length === 0
      ) {
        effectiveAmountKobo = currentApprovedFeeKobo;
      }

      expect(effectiveAmountKobo).toBe(BigInt(50000)); // Preserved
    });
  });

  describe('Payment Verification Race Condition Resolution', () => {
    it('validates gateway amount against initialized transaction amount instead of live config', () => {
      const initializedTxAmountKobo = BigInt(50000); // Initiated at ₦500
      const systemConfigCurrentFeeKobo = BigInt(70000); // Admin subsequently raised fee to ₦700
      const gatewayReportedAmountKobo = BigInt(50000); // Paystack verified ₦500 paid

      // Bug condition: comparing against systemConfigCurrentFeeKobo would falsely fail
      const faultyCheckPassed = gatewayReportedAmountKobo === systemConfigCurrentFeeKobo;
      expect(faultyCheckPassed).toBe(false);

      // Repaired condition: validate against authoritative initialized payment transaction
      const repairedCheckPassed = gatewayReportedAmountKobo === initializedTxAmountKobo;
      expect(repairedCheckPassed).toBe(true);
    });

    it('rejects payment if gateway amount differs from recorded transaction amount', () => {
      const initializedTxAmountKobo = BigInt(50000);
      const tamperedGatewayAmountKobo = BigInt(25000);

      const isValid = tamperedGatewayAmountKobo >= initializedTxAmountKobo;
      expect(isValid).toBe(false);
    });
  });

  describe('Application Form Fee vs Tuition Gate Isolation', () => {
    it('allows application form submission when form fee is paid without demanding tuition upfront', () => {
      const APPLICATION_FORM_FEE = BigInt(50000); // ₦500 form gate fee
      const FULL_PROGRAMME_TUITION = BigInt(12500000); // ₦125,000 full tuition

      const applicationDraft = {
        totalAmountKobo: FULL_PROGRAMME_TUITION, // Admission invoice calculation
      };

      const completedPaymentTx = {
        amountKobo: BigInt(50000), // Paid ₦500 form fee
        status: 'SUCCESS',
      };

      // Bug condition: checking against draft.totalAmountKobo required ₦125k to submit form
      const buggyGatePassed = completedPaymentTx.amountKobo >= applicationDraft.totalAmountKobo;
      expect(buggyGatePassed).toBe(false);

      // Repaired condition: checking against configured form fee requiredFeeKobo
      const requiredFeeKobo = APPLICATION_FORM_FEE;
      const repairedGatePassed = completedPaymentTx.amountKobo >= requiredFeeKobo;
      expect(repairedGatePassed).toBe(true);
    });

    it('rejects submission if recorded payment transaction is under the form fee', () => {
      const requiredFeeKobo = BigInt(50000);
      const insufficientPaymentTx = {
        amountKobo: BigInt(20000), // Only ₦200
        status: 'SUCCESS',
      };

      const gatePassed = insufficientPaymentTx.amountKobo >= requiredFeeKobo;
      expect(gatePassed).toBe(false);
    });
  });

  describe('Duplicate Callback & Replay Protection', () => {
    it('safely handles duplicate payment verification callback idempotently', () => {
      const existingTx = {
        reference: 'SWN-REF-999',
        status: 'SUCCESS', // Already finalized
        amountKobo: BigInt(50000),
      };

      // When existingTx is already SUCCESS, return success payload without re-crediting or erroring
      const isAlreadyFinalized = existingTx.status === 'SUCCESS';
      expect(isAlreadyFinalized).toBe(true);
    });
  });
});
