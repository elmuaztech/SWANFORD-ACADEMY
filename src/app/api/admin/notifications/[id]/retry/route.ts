import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, SafeUser } from '@/lib/auth/service';
import { requirePermission, AuthorizationError } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { NotificationStatus } from '@prisma/client';
import { toUserFacingError } from '@/lib/ui/error_messages';

export const dynamic = 'force-dynamic';

async function getAuthUser(req: NextRequest): Promise<SafeUser | null> {
  const authHeader = req.headers.get('authorization');
  let token: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  if (!token) {
    token = req.cookies.get('swanford_session')?.value;
  }
  if (!token) return null;
  return getCurrentUser(token);
}

/**
 * POST /api/admin/notifications/[id]/retry
 * Manually retries a failed or retryable notification.
 *
 * Distributed Systems & Security Guarantees:
 * - Requires NOTIFICATION_RETRY or NOTIFICATION_VIEW permission.
 * - Single atomic PostgreSQL transaction:
 *   1. Row lock FOR UPDATE on notification row.
 *   2. State guard: must be in FAILED, RETRYABLE, or FAILED_PERMANENT status.
 *   3. Reset notification state (status PENDING, retryCount 0, nextRetryAt now, increment leaseVersion).
 *   4. Immutable AuditLog creation.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    try {
      await requirePermission(user, PermissionCode.NOTIFICATION_RETRY);
    } catch {
      // Fallback: also accept NOTIFICATION_VIEW
      await requirePermission(user, PermissionCode.NOTIFICATION_VIEW);
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'Notification ID is required' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Lock notification row FOR UPDATE
      const lockedRows = await tx.$queryRaw<
        Array<{
          id: string;
          status: NotificationStatus;
          idempotency_key: string;
          lease_version: number;
        }>
      >`
        SELECT id, status, idempotency_key, lease_version
        FROM notifications
        WHERE id = ${id}::uuid
        FOR UPDATE;
      `;

      if (!lockedRows || lockedRows.length === 0) {
        throw new AuthorizationError('Notification not found', 404, 'NOT_FOUND');
      }

      const locked = lockedRows[0];

      // 2. Validate current state allows retry
      const retryableStatuses: NotificationStatus[] = [
        NotificationStatus.FAILED,
        NotificationStatus.RETRYABLE,
        NotificationStatus.FAILED_PERMANENT,
      ];

      if (!retryableStatuses.includes(locked.status)) {
        throw new AuthorizationError(
          `Notification cannot be retried from its current status (${locked.status}). Only FAILED, RETRYABLE, or FAILED_PERMANENT notifications may be retried.`,
          400,
          'INVALID_STATUS_FOR_RETRY'
        );
      }

      // 3. Reset notification to PENDING and increment leaseVersion
      const now = new Date();
      const updated = await tx.notification.update({
        where: { id },
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

      // 4. Create immutable AuditLog
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'NOTIFICATION_MANUAL_RETRY',
          entityType: 'Notification',
          entityId: id,
          oldValues: {
            status: locked.status,
            previousLeaseVersion: locked.lease_version,
          },
          newValues: {
            status: NotificationStatus.PENDING,
            newLeaseVersion: updated.leaseVersion,
            retriedAt: now.toISOString(),
          },
        },
      });

      return updated;
    });

    return NextResponse.json({
      success: true,
      message: 'Notification successfully reset and queued for immediate delivery.',
      notification: {
        id: result.id,
        status: result.status,
        retryCount: result.attempts,
        nextRetryAt: result.nextRetryAt,
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const userFacing = toUserFacingError(error);
    return NextResponse.json({ error: userFacing.message }, { status: 500 });
  }
}
