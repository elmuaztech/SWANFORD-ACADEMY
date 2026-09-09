import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { enqueueNotification } from '@/lib/notifications/outbox';
import { NotificationCategory } from '@prisma/client';

describe('Stage 10 Integration: Paystack Authoritative Notification Convergence', () => {
  const reference = `TEST-CONVERGENCE-${Date.now()}`;
  const authoritativeKey = `FINANCE:PAYMENT_CONFIRMED:PAYSTACK:${reference}`;

  afterEach(async () => {
    // Cleanup created notification
    await prisma.notification.deleteMany({
      where: { idempotencyKey: authoritativeKey },
    });
  });

  it('enforces single authoritative key and zero duplicate outbox entries across webhook and callback', async () => {
    // 1. First event: Webhook processing enqueues payment confirmation notification
    const firstEnqueue = await enqueueNotification({
      idempotencyKey: authoritativeKey,
      category: NotificationCategory.FINANCE,
      channel: 'EMAIL',
      recipientEmail: 'parent.paystack@swanford.academy',
      templateName: 'PAYMENT_CONFIRMATION',
      subject: 'Payment Confirmed: ₦50,000.00',
      bodyText: 'Your payment via Paystack was successful.',
      metadata: { reference, amountKobo: '5000000', source: 'webhook' },
    });

    expect(firstEnqueue.enqueued).toBe(true);
    expect(firstEnqueue.notificationId).toBeDefined();

    // 2. Second event: Browser redirect / callback verification executes immediately after
    // Attempts to enqueue using the EXACT SAME authoritative key
    const secondEnqueue = await enqueueNotification({
      idempotencyKey: authoritativeKey,
      category: NotificationCategory.FINANCE,
      channel: 'EMAIL',
      recipientEmail: 'parent.paystack@swanford.academy',
      templateName: 'PAYMENT_CONFIRMATION',
      subject: 'Payment Confirmed: ₦50,000.00',
      bodyText: 'Your payment via Paystack was successful.',
      metadata: { reference, amountKobo: '5000000', source: 'callback' },
    });

    // Both should return the same record ID and indicate duplicate
    expect(secondEnqueue.notificationId).toBe(firstEnqueue.notificationId);
    expect(secondEnqueue.duplicate).toBe(true);

    // 3. Verify exactly ONE record exists in PostgreSQL
    const matchingRecords = await prisma.notification.findMany({
      where: { idempotencyKey: authoritativeKey },
    });

    expect(matchingRecords).toHaveLength(1);
    expect(matchingRecords[0].recipientEmail).toBe('parent.paystack@swanford.academy');
  });

  it('distinguishes manual payment confirmation keys from Paystack keys', async () => {
    const paymentId = 'manual-payment-uuid-123';
    const receiptNumber = 'REC-2026-9999';
    const manualKey = `FINANCE:PAYMENT_CONFIRMED:MANUAL:${paymentId}:${receiptNumber}`;

    try {
      const manualEnqueue = await enqueueNotification({
        idempotencyKey: manualKey,
        category: NotificationCategory.FINANCE,
        channel: 'EMAIL',
        recipientEmail: 'cash.payer@swanford.academy',
        templateName: 'PAYMENT_CONFIRMATION',
        subject: 'Official Receipt REC-2026-9999',
        bodyText: 'Your manual bank transfer payment has been confirmed.',
      });

      expect(manualEnqueue.enqueued).toBe(true);
      expect(manualEnqueue.notificationId).toBeDefined();

      const record = await prisma.notification.findUnique({
        where: { id: manualEnqueue.notificationId! },
      });
      expect(record?.idempotencyKey).toBe(manualKey);
      expect(record?.idempotencyKey).not.toContain('PAYSTACK');
    } finally {
      await prisma.notification.deleteMany({
        where: { idempotencyKey: manualKey },
      });
    }
  });
});
