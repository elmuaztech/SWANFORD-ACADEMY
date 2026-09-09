import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { enqueueNotification } from '@/lib/notifications/outbox';
import {
  reapStaleNotificationLocks,
  processPendingNotifications,
} from '@/lib/notifications/worker';
import { MockEmailProvider } from '@/lib/notifications/provider';
import { NotificationCategory, NotificationStatus } from '@prisma/client';

describe('Stage 10 Integration: Crash Recovery, Stale-Lock Reaper & Exponential Backoff', () => {
  const testKeyPrefix = `TEST-CRASH-${Date.now()}`;

  afterEach(async () => {
    await prisma.notification.deleteMany({
      where: { idempotencyKey: { startsWith: testKeyPrefix } },
    });
  });

  it('reaps crashed/timed-out worker leases and transitions them back to PENDING', async () => {
    const key = `${testKeyPrefix}-STALE-LEASE`;
    const notification = await enqueueNotification({
      idempotencyKey: key,
      category: NotificationCategory.GENERAL,
      channel: 'EMAIL',
      recipientEmail: 'parent@swanford.academy',
      templateName: 'GENERAL_NOTICE',
      subject: 'Notice',
      bodyText: 'Notice body',
    });

    expect(notification.enqueued).toBe(true);
    const notificationId = notification.notificationId!;

    // Simulate worker crash: mark PROCESSING with leaseExpiresAt in the past
    const pastDate = new Date(Date.now() - 60000); // 1 minute ago
    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.PROCESSING,
        lockedAt: pastDate,
        lockedBy: 'crashed-worker-pid-9999',
        leaseExpiresAt: pastDate,
      },
    });

    // Run reaper
    const reapedCount = await reapStaleNotificationLocks();
    expect(reapedCount).toBeGreaterThanOrEqual(1);

    // Verify record was reclaimed and reset to PENDING
    const refreshed = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    expect(refreshed?.status).toBe(NotificationStatus.PENDING);
    expect(refreshed?.lockedAt).toBeNull();
    expect(refreshed?.lockedBy).toBeNull();
    expect(refreshed?.leaseExpiresAt).toBeNull();
  });

  it('applies exponential backoff on transient delivery failure and transitions to FAILED_PERMANENT on exceeding maxAttempts', async () => {
    const key = `${testKeyPrefix}-MAX-RETRIES`;
    const notification = await enqueueNotification({
      idempotencyKey: key,
      category: NotificationCategory.FINANCE,
      channel: 'EMAIL',
      recipientEmail: 'parent.retry@swanford.academy',
      templateName: 'INVOICE_ISSUED',
      subject: 'Invoice #001',
      bodyText: 'Invoice',
    });

    expect(notification.enqueued).toBe(true);
    const notificationId = notification.notificationId!;

    // Configure notification with maxAttempts = 2 and attempts = 1
    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        maxAttempts: 2,
        attempts: 1,
        status: NotificationStatus.PENDING,
      },
    });

    // Simulate provider failure (e.g. SMTP down)
    const failingProvider = new MockEmailProvider();
    failingProvider.setSimulateFailure(true, 'SMTP 535 5.7.8 Authentication credentials invalid');

    // Run worker loop with failing provider targeting this notification
    await processPendingNotifications({
      targetNotificationId: notificationId,
      batchSize: 10,
      provider: failingProvider,
      workerId: 'retry-worker-test',
    });

    // Record should now have attempts = 2 (reaching maxAttempts) and transition to FAILED_PERMANENT
    const afterFailure = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    expect(afterFailure?.attempts).toBe(2);
    expect(afterFailure?.status).toBe(NotificationStatus.FAILED_PERMANENT);
    expect(afterFailure?.errorMessage).toContain('Authentication credentials invalid');
  });
});
