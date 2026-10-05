import { NextRequest, NextResponse } from 'next/server';
import { reapStaleNotificationLocks, processPendingNotifications } from '@/lib/notifications/worker';
import { processDueScheduledReminders } from '@/lib/finance/reminder_service';
import { verifyCronAuthorization } from '@/lib/security/cron_auth';

/**
 * Swanford Academy — Bounded Cron Worker Endpoint
 *
 * Architecture Invariant:
 * - Designed for Vercel Cron / serverless environments.
 * - Source of truth remains the PostgreSQL queue.
 * - Does not rely on long-lived in-process daemons surviving serverless freeze.
 * - Enforces bounded batch size (25) and strict execution timing.
 * - Protected by Bearer token matching CRON_SECRET with timing-safe comparison.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // 1. Authorization check (timing-safe, fails closed in all environments)
  const auth = verifyCronAuthorization(request);
  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    // 2. Reap stale locks
    const reapedCount = await reapStaleNotificationLocks();

    // 3. Process due server-side scheduled payment reminders
    const remindersProcessed = await processDueScheduledReminders();

    // 4. Process bounded batch
    const batchResult = await processPendingNotifications({
      batchSize: 25,
      workerId: `vercel-cron-${Date.now()}`,
    });

    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      durationMs,
      reapedCount,
      remindersProcessed,
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
