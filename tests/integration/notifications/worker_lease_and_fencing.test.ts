import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { enqueueNotification } from '@/lib/notifications/outbox';
import {
  claimNotificationBatch,
  finalizeNotificationDelivery,
  processPendingNotifications,
} from '@/lib/notifications/worker';
import { MockEmailProvider } from '@/lib/notifications/provider';
import { NotificationCategory, NotificationStatus } from '@prisma/client';

describe('Stage 10 Integration: Worker Concurrency, Lease & Fencing Token', () => {
  const testKeyPrefix = `TEST-WORKER-${Date.now()}`;

  afterEach(async () => {
    await prisma.notification.deleteMany({
      where: { idempotencyKey: { startsWith: testKeyPrefix } },
    });
  });

  it('claims pending notifications, increments leaseVersion, and sets lease expiration', async () => {
    const key = `${testKeyPrefix}-CLAIM`;
    const res = await enqueueNotification({
      idempotencyKey: key,
      category: NotificationCategory.SECURITY,
      channel: 'EMAIL',
      recipientEmail: 'security@swanford.academy',
      templateName: 'PASSWORD_CHANGED',
      subject: 'Security Notice',
      bodyText: 'Password changed.',
    });

    // Worker 1 claims the batch
    const claimed = await claimNotificationBatch({
      targetNotificationId: res.notificationId,
      batchSize: 10,
      leaseDurationSeconds: 30,
      workerId: 'worker-1',
    });

    const targetJob = claimed.find((j) => j.idempotencyKey === key);
    expect(targetJob).toBeDefined();
    expect(targetJob?.status).toBe(NotificationStatus.PROCESSING);
    expect(targetJob?.leaseVersion).toBe(1);
    expect(targetJob?.lockedBy).toBe('worker-1');
    expect(targetJob?.leaseExpiresAt).toBeDefined();

    // Verify in database that it is in PROCESSING status
    const inDb = await prisma.notification.findUnique({
      where: { idempotencyKey: key },
    });
    expect(inDb?.status).toBe(NotificationStatus.PROCESSING);
    expect(inDb?.leaseVersion).toBe(1);
  });

  it('prevents a stale worker from overwriting state when leaseVersion does not match (Fencing Token)', async () => {
    const key = `${testKeyPrefix}-FENCING`;
    const res = await enqueueNotification({
      idempotencyKey: key,
      category: NotificationCategory.FINANCE,
      channel: 'EMAIL',
      recipientEmail: 'finance@swanford.academy',
      templateName: 'INVOICE_ISSUED',
      subject: 'Invoice Notice',
      bodyText: 'Invoice issued.',
    });

    // 1. Worker 1 claims the job (leaseVersion = 1)
    const claimedWorker1 = await claimNotificationBatch({
      targetNotificationId: res.notificationId,
      batchSize: 10,
      leaseDurationSeconds: 30,
      workerId: 'worker-1',
    });
    const jobWorker1 = claimedWorker1.find((j) => j.idempotencyKey === key)!;
    expect(jobWorker1.leaseVersion).toBe(1);

    // 2. Simulate worker 1 crashing or experiencing high network latency.
    // Meanwhile, lease expires and Worker 2 reclaims the job (leaseVersion increments to 2)
    await prisma.notification.update({
      where: { id: jobWorker1.id },
      data: {
        status: NotificationStatus.PENDING,
        lockedBy: null,
        lockedAt: null,
        leaseExpiresAt: null,
      },
    });

    const claimedWorker2 = await claimNotificationBatch({
      targetNotificationId: res.notificationId,
      batchSize: 10,
      leaseDurationSeconds: 30,
      workerId: 'worker-2',
    });
    const jobWorker2 = claimedWorker2.find((j) => j.idempotencyKey === key)!;
    expect(jobWorker2.leaseVersion).toBe(2);

    // 3. Worker 1 (stale, thinks leaseVersion is 1) attempts to finalize delivery
    const worker1Finalize = await finalizeNotificationDelivery({
      notificationId: jobWorker1.id,
      claimedVersion: 1, // STALE version!
      success: true,
      providerMessageId: 'msg-from-stale-worker-1',
    });

    // Finalize must be rejected by fencing token guard
    expect(worker1Finalize.fencedOut).toBe(true);
    expect(worker1Finalize.updated).toBe(false);

    // 4. Verify DB state is still owned by Worker 2 (status is still PROCESSING, leaseVersion = 2)
    const dbCheck = await prisma.notification.findUnique({
      where: { id: jobWorker1.id },
    });
    expect(dbCheck?.status).toBe(NotificationStatus.PROCESSING);
    expect(dbCheck?.leaseVersion).toBe(2);
    expect(dbCheck?.lockedBy).toBe('worker-2');

    // 5. Worker 2 successfully finalizes with the valid fencing token (leaseVersion = 2)
    const worker2Finalize = await finalizeNotificationDelivery({
      notificationId: jobWorker2.id,
      claimedVersion: 2,
      success: true,
      providerMessageId: 'msg-from-valid-worker-2',
    });

    expect(worker2Finalize.fencedOut).toBe(false);
    expect(worker2Finalize.updated).toBe(true);

    const finalDb = await prisma.notification.findUnique({
      where: { id: jobWorker1.id },
    });
    expect(finalDb?.status).toBe(NotificationStatus.SENT);
    expect(finalDb?.sentAt).toBeDefined();
    expect(finalDb?.providerMessageId).toBe('msg-from-valid-worker-2');
  });

  it('runs full pipeline: claim -> mock send without DB locks -> finalize SENT', async () => {
    const key = `${testKeyPrefix}-FULL-PIPELINE`;
    const res = await enqueueNotification({
      idempotencyKey: key,
      category: NotificationCategory.ADMISSION_DECISION,
      channel: 'EMAIL',
      recipientEmail: 'admitted.parent@swanford.academy',
      templateName: 'ADMISSION_DECISION',
      subject: 'Offer of Admission',
      bodyText: 'Congratulations!',
    });

    const mockProvider = new MockEmailProvider();
    const result = await processPendingNotifications({
      targetNotificationId: res.notificationId,
      batchSize: 10,
      provider: mockProvider,
      workerId: 'integration-worker-test',
    });

    expect(result.processedCount).toBeGreaterThanOrEqual(1);
    expect(result.succeededCount).toBeGreaterThanOrEqual(1);

    const record = await prisma.notification.findUnique({
      where: { idempotencyKey: key },
    });

    expect(record?.status).toBe(NotificationStatus.SENT);
    expect(record?.sentAt).not.toBeNull();
    expect(record?.errorMessage).toBeNull();
    expect(mockProvider.sentEmails.some((e) => e.to === 'admitted.parent@swanford.academy')).toBe(true);
  });
});
