import { prisma } from '@/lib/prisma';
import { NotificationStatus, Prisma } from '@prisma/client';
import { getEmailProvider, EmailProvider } from './provider';
import { ProcessBatchResult } from './types';

export interface ClaimedNotificationJob {
  id: string;
  recipientEmail: string;
  subject: string;
  bodyText: string;
  htmlBody: string | null;
  idempotencyKey: string | null;
  attempts: number;
  maxAttempts: number;
  leaseVersion: number;
  status: NotificationStatus;
  lockedBy: string | null;
  leaseExpiresAt: Date | null;
}

export interface ClaimBatchOptions {
  batchSize?: number;
  leaseDurationSeconds?: number;
  workerId?: string;
  targetNotificationId?: string;
  client?: Prisma.TransactionClient | typeof prisma;
}

export interface FinalizeOptions {
  notificationId: string;
  claimedVersion: number;
  success: boolean;
  providerMessageId?: string;
  error?: string;
  retryable?: boolean;
  client?: Prisma.TransactionClient | typeof prisma;
}

export interface FinalizeResult {
  updated: boolean;
  fencedOut: boolean;
}

/**
 * PHASE 1: Short Claim Transaction
 * Uses SELECT ... FOR UPDATE SKIP LOCKED, bumps lease_version (fencing token),
 * sets lease_expires_at, and commits immediately. Zero external I/O here.
 */
export async function claimNotificationBatch(
  options: ClaimBatchOptions = {}
): Promise<ClaimedNotificationJob[]> {
  const {
    batchSize = 15,
    leaseDurationSeconds = 300,
    workerId = `worker-${process.pid || 1}`,
    targetNotificationId,
    client = prisma,
  } = options;

  interface RawClaimedRow {
    id: string;
    recipient_email: string;
    subject: string;
    body_text: string;
    html_body: string | null;
    idempotency_key: string | null;
    attempts: number;
    max_attempts: number;
    lease_version: number;
    status: NotificationStatus;
    locked_by: string | null;
    lease_expires_at: Date | null;
  }

  const executeClaim = async (tx: Prisma.TransactionClient): Promise<ClaimedNotificationJob[]> => {
    const rows = targetNotificationId
      ? await tx.$queryRaw<RawClaimedRow[]>`
          SELECT id, recipient_email, subject, body_text, html_body, idempotency_key, attempts, max_attempts, lease_version, status, locked_by, lease_expires_at
          FROM notifications
          WHERE id = ${targetNotificationId}::uuid
          FOR UPDATE SKIP LOCKED;
        `
      : await tx.$queryRaw<RawClaimedRow[]>`
          SELECT id, recipient_email, subject, body_text, html_body, idempotency_key, attempts, max_attempts, lease_version, status, locked_by, lease_expires_at
          FROM notifications
          WHERE status IN ('PENDING', 'RETRYABLE')
            AND (next_retry_at IS NULL OR next_retry_at <= (NOW() AT TIME ZONE 'UTC'))
            AND (lease_expires_at IS NULL OR lease_expires_at <= (NOW() AT TIME ZONE 'UTC'))
          ORDER BY created_at ASC
          LIMIT ${batchSize}
          FOR UPDATE SKIP LOCKED;
        `;

    if (!rows || rows.length === 0) {
      return [];
    }

    const ids = rows.map((r) => r.id);
    const leaseInterval = `${leaseDurationSeconds} seconds`;

    await tx.$executeRaw`
      UPDATE notifications
      SET status = 'PROCESSING',
          locked_at = (NOW() AT TIME ZONE 'UTC'),
          locked_by = ${workerId},
          lease_expires_at = (NOW() AT TIME ZONE 'UTC') + (${leaseInterval})::interval,
          lease_version = lease_version + 1
      WHERE id = ANY(${ids}::uuid[]);
    `;

    return rows.map((r) => ({
      id: r.id,
      recipientEmail: r.recipient_email,
      subject: r.subject,
      bodyText: r.body_text,
      htmlBody: r.html_body,
      idempotencyKey: r.idempotency_key,
      attempts: r.attempts,
      maxAttempts: r.max_attempts,
      leaseVersion: r.lease_version + 1,
      status: NotificationStatus.PROCESSING,
      lockedBy: workerId,
      leaseExpiresAt: new Date(Date.now() + leaseDurationSeconds * 1000),
    }));
  };

  if ('$transaction' in client) {
    return (client as typeof prisma).$transaction(executeClaim);
  }
  return executeClaim(client as Prisma.TransactionClient);
}

/**
 * PHASE 3: Short Finalize Transaction conditioned on fencing token
 * Conditional update: WHERE id = $id AND lease_version = $claimedVersion.
 * Prevents stale workers from overwriting a newer lease.
 */
export async function finalizeNotificationDelivery(
  options: FinalizeOptions
): Promise<FinalizeResult> {
  const {
    notificationId,
    claimedVersion,
    success,
    providerMessageId,
    error,
    retryable = true,
    client = prisma,
  } = options;

  if (success) {
    const updateCount = await client.$executeRaw`
      UPDATE notifications
      SET status = 'SENT',
          sent_at = (NOW() AT TIME ZONE 'UTC'),
          provider_message_id = ${providerMessageId || null},
          error_message = NULL,
          locked_at = NULL,
          locked_by = NULL,
          lease_expires_at = NULL,
          attempts = attempts + 1
      WHERE id = ${notificationId}::uuid
        AND lease_version = ${claimedVersion};
    `;

    const updated = Number(updateCount) > 0;
    return {
      updated,
      fencedOut: !updated,
    };
  }

  // Handle failure
  const errorMsg = error || 'Delivery failed';

  // Read current attempts to see if max reached
  const currentJob = await client.notification.findUnique({
    where: { id: notificationId },
    select: { attempts: true, maxAttempts: true },
  });

  const nextAttempt = (currentJob?.attempts || 0) + 1;
  const maxAttempts = currentJob?.maxAttempts || 3;

  if (!retryable || nextAttempt >= maxAttempts) {
    // Transition to FAILED_PERMANENT
    const updateCount = await client.$executeRaw`
      UPDATE notifications
      SET status = 'FAILED_PERMANENT',
          error_message = ${errorMsg},
          locked_at = NULL,
          locked_by = NULL,
          lease_expires_at = NULL,
          attempts = attempts + 1
      WHERE id = ${notificationId}::uuid
        AND lease_version = ${claimedVersion};
    `;

    const updated = Number(updateCount) > 0;
    return {
      updated,
      fencedOut: !updated,
    };
  }

  // Retryable: Exponential backoff (attempt 1: 60s, attempt 2: 120s, attempt 3: 240s)
  const delaySeconds = Math.pow(2, nextAttempt) * 30;

  const updateCount = await client.$executeRaw`
    UPDATE notifications
    SET status = 'RETRYABLE',
        error_message = ${errorMsg},
        next_retry_at = (NOW() AT TIME ZONE 'UTC') + (${delaySeconds} * INTERVAL '1 second'),
        locked_at = NULL,
        locked_by = NULL,
        lease_expires_at = NULL,
        attempts = attempts + 1
    WHERE id = ${notificationId}::uuid
      AND lease_version = ${claimedVersion};
  `;

  const updated = Number(updateCount) > 0;
  return {
    updated,
    fencedOut: !updated,
  };
}

export type ProcessPendingOptions =
  | number
  | {
      batchSize?: number;
      workerId?: string;
      provider?: EmailProvider;
      client?: Prisma.TransactionClient | typeof prisma;
      targetNotificationId?: string;
    };

/**
 * Swanford Academy — Full Leased Notification Processing Pipeline
 * Executes: Phase 1 (Claim) -> Phase 2 (Send without locks) -> Phase 3 (Finalize with Fencing Token)
 */
export async function processPendingNotifications(
  optionsOrBatchSize: ProcessPendingOptions = 15,
  posWorkerId = `worker-${process.pid || 1}`,
  posClient: Prisma.TransactionClient | typeof prisma = prisma,
  posTargetNotificationId?: string
): Promise<ProcessBatchResult> {
  let batchSize = 15;
  let workerId = posWorkerId;
  let client = posClient;
  let targetNotificationId = posTargetNotificationId;
  let customProvider: EmailProvider | undefined;

  if (typeof optionsOrBatchSize === 'object') {
    batchSize = optionsOrBatchSize.batchSize ?? 15;
    workerId = optionsOrBatchSize.workerId ?? `worker-${process.pid || 1}`;
    client = optionsOrBatchSize.client ?? prisma;
    targetNotificationId = optionsOrBatchSize.targetNotificationId;
    customProvider = optionsOrBatchSize.provider;
  } else {
    batchSize = optionsOrBatchSize;
  }

  const stats: ProcessBatchResult = {
    claimed: 0,
    processed: 0,
    failedRetryable: 0,
    failedPermanent: 0,
    staleDiscarded: 0,
    processedCount: 0,
    succeededCount: 0,
    failedCount: 0,
    deadLetterCount: 0,
  };

  // Phase 1: Claim
  const claimedJobs = await claimNotificationBatch({
    batchSize,
    workerId,
    client,
    targetNotificationId,
  });

  if (claimedJobs.length === 0) {
    return stats;
  }

  stats.claimed = claimedJobs.length;
  const provider = customProvider || getEmailProvider();

  // Phase 2 & 3: External dispatch outside lock, conditional finalize
  for (const job of claimedJobs) {
    let sendResult;
    try {
      sendResult = await provider.sendEmail({
        to: job.recipientEmail,
        subject: job.subject,
        bodyText: job.bodyText,
        htmlBody: job.htmlBody || undefined,
        idempotencyKey: job.idempotencyKey || undefined,
      });
    } catch (err) {
      sendResult = {
        success: false,
        retryable: true,
        error: err instanceof Error ? err.message : 'Unexpected transport error',
      };
    }

    const finalize = await finalizeNotificationDelivery({
      notificationId: job.id,
      claimedVersion: job.leaseVersion,
      success: sendResult.success,
      providerMessageId: sendResult.messageId || sendResult.providerMessageId,
      error: sendResult.error,
      retryable: sendResult.retryable ?? true,
      client,
    });

    if (finalize.fencedOut) {
      stats.staleDiscarded++;
    } else if (sendResult.success) {
      stats.processed++;
      stats.succeededCount++;
    } else {
      stats.failedCount++;
      const nextAtt = job.attempts + 1;
      if (!sendResult.retryable || nextAtt >= job.maxAttempts) {
        stats.failedPermanent++;
        stats.deadLetterCount++;
      } else {
        stats.failedRetryable++;
      }
    }
  }

  stats.processedCount = stats.processed;
  return stats;
}

/**
 * Recovers stale leases abandoned by crashed worker processes.
 * Any notification in PROCESSING with expired lease is returned to PENDING.
 */
export async function reapStaleNotificationLocks(client = prisma): Promise<number> {
  const result = await client.$executeRaw`
    UPDATE notifications
    SET status = 'PENDING',
        locked_at = NULL,
        locked_by = NULL,
        lease_expires_at = NULL
    WHERE status = 'PROCESSING'
      AND lease_expires_at < (NOW() AT TIME ZONE 'UTC');
  `;
  return Number(result);
}
