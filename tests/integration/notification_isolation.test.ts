import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { RoleCode, UserStatus, NotificationChannel, NotificationCategory, NotificationStatus } from '@prisma/client';
import { hashPassword } from '@/lib/auth/password';

describe('Notification Security: Relational UserNotificationRead Isolation', () => {
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };
  let sharedNotification: { id: string };
  let targetedNotificationUserA: { id: string };

  beforeAll(async () => {
    const passwordHash = await hashPassword('SecureTestPass123!');
    const timestamp = Date.now();

    // Create User A
    userA = await prisma.user.create({
      data: {
        email: `test-notif-user-a-${timestamp}@swanford.local`,
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    });

    // Create User B
    userB = await prisma.user.create({
      data: {
        email: `test-notif-user-b-${timestamp}@swanford.local`,
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    });

    // Assign ADMIN role to both
    const adminRole = await prisma.role.findUnique({ where: { code: RoleCode.ADMIN } });
    if (adminRole) {
      await prisma.userRole.createMany({
        data: [
          { userId: userA.id, roleId: adminRole.id },
          { userId: userB.id, roleId: adminRole.id },
        ],
      });
    }

    // Create a shared administrative notification (recipientUserId: null)
    sharedNotification = await prisma.notification.create({
      data: {
        channel: NotificationChannel.EMAIL,
        category: NotificationCategory.GENERAL,
        templateName: 'SYSTEM_ANNOUNCEMENT',
        subject: 'General School Operational Update',
        bodyText: 'Term planning meeting scheduled for Friday.',
        status: NotificationStatus.DELIVERED,
      },
    });

    // Create a targeted notification specifically for User A
    targetedNotificationUserA = await prisma.notification.create({
      data: {
        recipientUserId: userA.id,
        recipientEmail: userA.email,
        channel: NotificationChannel.EMAIL,
        category: NotificationCategory.SECURITY,
        templateName: 'SECURITY_ALERT',
        subject: 'Security Notice',
        bodyText: 'Password changed successfully.',
        status: NotificationStatus.DELIVERED,
      },
    });
  });

  afterAll(async () => {
    // Cleanup created test records
    await prisma.userNotificationRead.deleteMany({
      where: {
        OR: [
          { userId: userA.id },
          { userId: userB.id },
          { notificationId: sharedNotification.id },
          { notificationId: targetedNotificationUserA.id },
        ],
      },
    });

    await prisma.notification.deleteMany({
      where: {
        id: { in: [sharedNotification.id, targetedNotificationUserA.id] },
      },
    });

    await prisma.userRole.deleteMany({
      where: { userId: { in: [userA.id, userB.id] } },
    });

    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    });
  });

  it('initially shows shared notification as unread for both User A and User B', async () => {
    const notifsForA = await prisma.notification.findUnique({
      where: { id: sharedNotification.id },
      include: { reads: { where: { userId: userA.id } } },
    });
    const notifsForB = await prisma.notification.findUnique({
      where: { id: sharedNotification.id },
      include: { reads: { where: { userId: userB.id } } },
    });

    expect(notifsForA?.reads.length).toBe(0);
    expect(notifsForB?.reads.length).toBe(0);
  });

  it('marks shared notification as read for User A without affecting User B (cross-user isolation)', async () => {
    // User A marks shared notification as read
    await prisma.userNotificationRead.upsert({
      where: {
        notificationId_userId: {
          notificationId: sharedNotification.id,
          userId: userA.id,
        },
      },
      create: {
        notificationId: sharedNotification.id,
        userId: userA.id,
      },
      update: {},
    });

    // Query for User A: MUST be read
    const queryA = await prisma.notification.findUnique({
      where: { id: sharedNotification.id },
      include: { reads: { where: { userId: userA.id } } },
    });
    expect(queryA?.reads.length).toBe(1);
    expect(queryA?.reads[0].userId).toBe(userA.id);

    // Query for User B: MUST STILL BE UNREAD
    const queryB = await prisma.notification.findUnique({
      where: { id: sharedNotification.id },
      include: { reads: { where: { userId: userB.id } } },
    });
    expect(queryB?.reads.length).toBe(0);
  });

  it('allows User B to subsequently mark as read with independent timestamp', async () => {
    await prisma.userNotificationRead.upsert({
      where: {
        notificationId_userId: {
          notificationId: sharedNotification.id,
          userId: userB.id,
        },
      },
      create: {
        notificationId: sharedNotification.id,
        userId: userB.id,
      },
      update: {},
    });

    const allReads = await prisma.userNotificationRead.findMany({
      where: { notificationId: sharedNotification.id },
    });

    expect(allReads.length).toBe(2);
    const userIds = allReads.map((r) => r.userId);
    expect(userIds).toContain(userA.id);
    expect(userIds).toContain(userB.id);
  });

  it('enforces unique constraint on [notificationId, userId]', async () => {
    await expect(
      prisma.userNotificationRead.create({
        data: {
          notificationId: sharedNotification.id,
          userId: userA.id,
        },
      })
    ).rejects.toThrow();
  });
});
