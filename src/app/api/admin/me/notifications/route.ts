import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { prisma } from '@/lib/prisma';
import { RoleCode, NotificationCategory } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * Swanford Academy — User In-App Notifications API
 * 
 * Directives:
 * 1. Strictly uses the relational `UserNotificationRead` table for per-user read tracking.
 * 2. Zero `metadata.reads` JSON manipulation.
 * 3. Prevents IDOR and cross-user read leakage: one user's action never affects another.
 * 4. Queries authentic PostgreSQL notifications table.
 */

const ALLOWED_STAFF_ROLES: RoleCode[] = [
  RoleCode.SUPER_ADMIN,
  RoleCode.ADMIN,
  RoleCode.ACCOUNTANT,
  RoleCode.TEACHER,
];

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const roles = actor.roles || [];
    const isStaffOrAdmin = roles.some((r) => ALLOWED_STAFF_ROLES.includes(r));

    if (!isStaffOrAdmin) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    // Fetch notifications targeted to this user OR shared administrative alerts
    const notifications = await prisma.notification.findMany({
      where: {
        OR: [
          { recipientUserId: actor.id },
          { recipientEmail: actor.email },
          {
            recipientUserId: null,
            category: {
              in: [
                NotificationCategory.SECURITY,
                NotificationCategory.FINANCE,
                NotificationCategory.ADMISSION_DECISION,
                NotificationCategory.ADMISSION_GENERAL,
                NotificationCategory.ACADEMIC,
                NotificationCategory.GENERAL,
              ],
            },
          },
        ],
      },
      include: {
        reads: {
          where: { userId: actor.id },
          select: { readAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const formatted = notifications.map((n) => {
      const isRead = n.reads.length > 0;
      const readAt = isRead ? n.reads[0].readAt.toISOString() : null;

      return {
        id: n.id,
        category: n.category,
        subject: n.subject,
        bodyText: n.bodyText,
        status: n.status,
        createdAt: n.createdAt.toISOString(),
        isRead,
        readAt,
      };
    });

    const unreadCount = formatted.filter((n) => !n.isRead).length;

    return NextResponse.json({
      notifications: formatted,
      unreadCount,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to retrieve notifications.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/me/notifications
 * Mark a single notification or all accessible notifications as read for THIS authenticated user.
 */
export async function PATCH(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { notificationId, markAll } = body;

    if (markAll) {
      // Find all accessible notifications
      const accessibleNotifications = await prisma.notification.findMany({
        where: {
          OR: [
            { recipientUserId: actor.id },
            { recipientEmail: actor.email },
            { recipientUserId: null },
          ],
        },
        select: { id: true },
        take: 100,
      });

      if (accessibleNotifications.length > 0) {
        await prisma.userNotificationRead.createMany({
          data: accessibleNotifications.map((n) => ({
            notificationId: n.id,
            userId: actor.id,
          })),
          skipDuplicates: true,
        });
      }

      return NextResponse.json({ success: true, message: 'All notifications marked as read.' });
    }

    if (!notificationId) {
      return NextResponse.json({ error: 'notificationId is required.' }, { status: 400 });
    }

    // Verify access to this notification
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      return NextResponse.json({ error: 'Notification not found.' }, { status: 404 });
    }

    const isTargetedToUser =
      notification.recipientUserId === actor.id || notification.recipientEmail === actor.email;
    const isSharedAdmin = notification.recipientUserId === null;

    if (!isTargetedToUser && !isSharedAdmin) {
      return NextResponse.json({ error: 'Access denied to this notification.' }, { status: 403 });
    }

    // Upsert into UserNotificationRead table
    const record = await prisma.userNotificationRead.upsert({
      where: {
        notificationId_userId: {
          notificationId,
          userId: actor.id,
        },
      },
      create: {
        notificationId,
        userId: actor.id,
      },
      update: {},
    });

    return NextResponse.json({
      success: true,
      notificationId,
      isRead: true,
      readAt: record.readAt.toISOString(),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to update notification read status.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
