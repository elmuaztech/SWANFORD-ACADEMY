import { NextRequest, NextResponse } from 'next/server';
import { reapStaleNotificationLocks, processPendingNotifications } from '@/lib/notifications/worker';

/**
 * Swanford Academy — Bounded Cron Worker Endpoint
 *
 * Architecture Invariant:
 * - Designed for Vercel Cron / serverless environments.
 * - Source of truth remains the PostgreSQL queue.
 * - Does not rely on long-lived in-process daemons surviving serverless freeze.
 * - Enforces bounded batch size (25) and strict execution timing.
 * - Protected by Bearer token matching CRON_SECRET or NODE_ENV === 'development'.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // 1. Authorization check
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (process.env.NODE_ENV === 'production') {
    if (!cronSecret) {
      return NextResponse.json(
        { error: 'CRON_SECRET is not configured on the server' },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized cron invocation' },
        { status: 401 }
      );
    }
  } else if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // In dev/test, if CRON_SECRET is set, require match; otherwise allow for local testing
    return NextResponse.json(
      { error: 'Unauthorized cron invocation' },
      { status: 401 }
    );
  }

  try {
    // 2. Reap stale locks
    const reapedCount = await reapStaleNotificationLocks();

    // 3. Process bounded batch
    const batchResult = await processPendingNotifications({
      batchSize: 25,
      workerId: `vercel-cron-${Date.now()}`,
    });

    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      durationMs,
      reapedCount,
      batch: {
        processedCount: batchResult.processedCount,
        succeededCount: batchResult.succeededCount,
        failedCount: batchResult.failedCount,
        deadLetterCount: batchResult.deadLetterCount,
      },
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error('[Notifications Cron Worker Error]', error);

    return NextResponse.json(
      {
        success: false,
        durationMs,
        error: error instanceof Error ? error.message : 'Unknown worker failure',
      },
      { status: 500 }
    );
  }
}
