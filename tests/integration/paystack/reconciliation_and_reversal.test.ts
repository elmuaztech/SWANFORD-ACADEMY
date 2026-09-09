import { describe, it, expect } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  GatewayProvider,
  GatewayTransactionStatus,
  ReconciliationStatus,
  SettlementStatus,
} from '@prisma/client';
import {
  reconcileSettlementBatch,
  handleGatewayReversalOrRefund,
} from '@/lib/paystack/service';

describe('Stage 9 — Integration: Settlement Reconciliation & Reversal Preservation', () => {
  it('reconciles settlement batch, linking transactions and calculating net amounts', async () => {
    const ref1 = `SWN-INV-recon1-${Date.now()}`;
    const ref2 = `SWN-APP-recon2-${Date.now()}`;

    // Create 2 confirmed transactions waiting for settlement
    await prisma.paymentTransaction.createMany({
      data: [
        {
          gatewayReference: ref1,
          gatewayProvider: GatewayProvider.PAYSTACK,
          status: GatewayTransactionStatus.SUCCESS,
          amountKobo: BigInt(5000000), // ₦50,000
          gatewayFeeKobo: BigInt(75000), // ₦750
          netAmountKobo: BigInt(4925000),
          settlementStatus: SettlementStatus.PENDING,
          reconciliationStatus: ReconciliationStatus.UNRECONCILED,
        },
        {
          gatewayReference: ref2,
          gatewayProvider: GatewayProvider.PAYSTACK,
          status: GatewayTransactionStatus.SUCCESS,
          amountKobo: BigInt(500000), // ₦5,000
          gatewayFeeKobo: BigInt(7500), // ₦75
          netAmountKobo: BigInt(492500),
          settlementStatus: SettlementStatus.PENDING,
          reconciliationStatus: ReconciliationStatus.UNRECONCILED,
        },
      ],
    });

    const settlementId = `stl_${Date.now()}`;
    const settlementData = {
      id: settlementId,
      gross_amount: 5500000, // ₦55,000
      total_fees: 82500,     // ₦825
      net_amount: 5417500,   // ₦54,175
      status: 'success',
      settled_at: new Date().toISOString(),
      bank_name: 'Guaranty Trust Bank',
      bank_account_number: '0123456789',
      transactions: [
        { id: 1, reference: ref1, amount: 5000000, fees: 75000 },
        { id: 2, reference: ref2, amount: 500000, fees: 7500 },
      ],
    };

    const settlement = await reconcileSettlementBatch(settlementData);

    expect(settlement.settlementId).toBe(settlementId);
    expect(settlement.grossAmountKobo).toBe(BigInt(5500000));
    expect(settlement.netAmountKobo).toBe(BigInt(5417500));
    expect(settlement.status).toBe(SettlementStatus.SETTLED);

    // Verify both transactions now marked as SETTLED and RECONCILED
    const tx1 = await prisma.paymentTransaction.findUniqueOrThrow({
      where: { gatewayReference: ref1 },
    });
    expect(tx1.settlementStatus).toBe(SettlementStatus.SETTLED);
    expect(tx1.reconciliationStatus).toBe(ReconciliationStatus.RECONCILED);
    expect(tx1.settlementBatchId).toBe(settlement.id);

    const tx2 = await prisma.paymentTransaction.findUniqueOrThrow({
      where: { gatewayReference: ref2 },
    });
    expect(tx2.settlementStatus).toBe(SettlementStatus.SETTLED);
    expect(tx2.reconciliationStatus).toBe(ReconciliationStatus.RECONCILED);
    expect(tx2.settlementBatchId).toBe(settlement.id);
  });

  it('preserves financial history on gateway refund/reversal without mutating ledger rows', async () => {
    const ref = `SWN-INV-rev-${Date.now()}`;

    const tx = await prisma.paymentTransaction.create({
      data: {
        gatewayReference: ref,
        gatewayProvider: GatewayProvider.PAYSTACK,
        status: GatewayTransactionStatus.SUCCESS,
        amountKobo: BigInt(2000000),
        currency: 'NGN',
      },
    });

    await handleGatewayReversalOrRefund({
      id: 887766,
      reference: ref,
      amount: 2000000,
      status: 'reversed',
    });

    const updatedTx = await prisma.paymentTransaction.findUniqueOrThrow({
      where: { id: tx.id },
    });

    // Transaction status marked as REVERSED
    expect(updatedTx.status).toBe(GatewayTransactionStatus.REVERSED);

    // Audit log verifies reversal was logged
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entityType: 'PaymentTransaction',
        entityId: tx.id,
        action: 'PAYSTACK_TRANSACTION_REVERSED_OR_REFUNDED',
      },
    });
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);
  });
});
