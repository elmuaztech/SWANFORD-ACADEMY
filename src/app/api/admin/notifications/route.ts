import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, SafeUser } from '@/lib/auth/service';
import { requirePermission, AuthorizationError } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { NotificationCategory, NotificationChannel, NotificationStatus } from '@prisma/client';
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
 * GET /api/admin/notifications
 * Lists notifications with pagination and filters.
 * Requires NOTIFICATION_VIEW permission.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    await requirePermission(user, PermissionCode.NOTIFICATION_VIEW);

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    const statusParam = searchParams.get('status');
    const categoryParam = searchParams.get('category');
    const channelParam = searchParams.get('channel');
    const search = searchParams.get('search')?.trim();

    const where: Record<string, unknown> = {};

    if (statusParam && Object.values(NotificationStatus).includes(statusParam as NotificationStatus)) {
      where.status = statusParam as NotificationStatus;
    }

    if (categoryParam && Object.values(NotificationCategory).includes(categoryParam as NotificationCategory)) {
      where.category = categoryParam as NotificationCategory;
    }

    if (channelParam && Object.values(NotificationChannel).includes(channelParam as NotificationChannel)) {
      where.channel = channelParam as NotificationChannel;
    }

    if (search) {
      where.OR = [
        { idempotencyKey: { contains: search, mode: 'insensitive' } },
        { recipientEmail: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, notifications] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          idempotencyKey: true,
          recipientUserId: true,
          recipientEmail: true,
          recipientPhone: true,
          channel: true,
          category: true,
          status: true,
          templateName: true,
          subject: true,
          attempts: true,
          maxAttempts: true,
          nextRetryAt: true,
          sentAt: true,
          deliveredAt: true,
          errorMessage: true,
          createdAt: true,
        },
      }),
    ]);

    const mapped = notifications.map((n) => ({
      ...n,
      retryCount: n.attempts,
      maxRetries: n.maxAttempts,
      lastError: n.errorMessage,
    }));

    return NextResponse.json({
      data: mapped,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
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
