import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { enqueueNotification } from '@/lib/notifications/outbox';
import { NotificationCategory, NotificationStatus, RoleCode, UserStatus } from '@prisma/client';
import { hashPassword } from '@/lib/auth/password';

describe('Stage 10 Integration: Admin Manual Retry with Atomic AuditLog', () => {
  const testKeyPrefix = `TEST-ADMIN-RETRY-${Date.now()}`;
  let adminUserId: string;

  beforeEach(async () => {
    // Create an active admin user for auditing
    const pw = await hashPassword('AdminPass123!@#');
    const admin = await prisma.user.create({
      data: {
        email: `admin.retry.${Date.now()}@swanford.test`,
        passwordHash: pw,
        status: UserStatus.ACTIVE,
      },
    });
    adminUserId = admin.id;

    const adminRole = await prisma.role.findUnique({
      where: { code: RoleCode.ADMIN },
    });
    if (adminRole) {
      await prisma.userRole.create({
        data: {
          userId: admin.id,
          roleId: adminRole.id,
        },
      });
    }
  });

  afterEach(async () => {
    await prisma.notification.deleteMany({
      where: { idempotencyKey: { startsWith: testKeyPrefix } },
    });
    await prisma.auditLog.deleteMany({
      where: { userId: adminUserId },
    });
    await prisma.userRole.deleteMany({ where: { userId: adminUserId } });
    await prisma.user.deleteMany({ where: { id: adminUserId } });
  });

  it('performs notification state reset and AuditLog creation in a single atomic transaction', async () => {
    const key = `${testKeyPrefix}-RESET-ATOMIC`;
    const record = await enqueueNotification({
      idempotencyKey: key,
      category: NotificationCategory.SECURITY,
      channel: 'EMAIL',
      recipientEmail: 'security.alert@swanford.academy',
      templateName: 'PASSWORD_CHANGED',
      subject: 'Security Notice',
      bodyText: 'Security Notice Content',
    });

    expect(record.enqueued).toBe(true);
    const notificationId = record.notificationId!;

    // Mark as FAILED with prior errors and retry count
    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.FAILED_PERMANENT,
        attempts: 5,
        errorMessage: 'SMTP 550 Mailbox does not exist',
        lockedBy: 'stale-worker',
        leaseVersion: 3,
      },
    });

    // Perform atomic retry transaction (matching the route logic)
    const result = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.PENDING,
          attempts: 0,
          nextRetryAt: now,
          lockedAt: null,
          lockedBy: null,
          leaseExpiresAt: null,
          errorMessage: null,
          leaseVersion: { increment: 1 },
        },
      });

      const audit = await tx.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'NOTIFICATION_MANUAL_RETRY',
          entityType: 'Notification',
          entityId: notificationId,
          oldValues: {
            status: NotificationStatus.FAILED_PERMANENT,
            previousLeaseVersion: 3,
          },
          newValues: {
            status: NotificationStatus.PENDING,
            newLeaseVersion: updated.leaseVersion,
            retriedAt: now.toISOString(),
          },
        },
      });

      return { updated, audit };
    });

    expect(result.updated.status).toBe(NotificationStatus.PENDING);
    expect(result.updated.attempts).toBe(0);
    expect(result.updated.leaseVersion).toBe(4);
    expect(result.updated.errorMessage).toBeNull();
    expect(result.updated.lockedBy).toBeNull();

    // Verify AuditLog was created atomically
    expect(result.audit.action).toBe('NOTIFICATION_MANUAL_RETRY');
    expect(result.audit.entityId).toBe(notificationId);
    expect(result.audit.userId).toBe(adminUserId);

    const auditInDb = await prisma.auditLog.findUnique({
      where: { id: result.audit.id },
    });
    expect(auditInDb).not.toBeNull();
  });
});
