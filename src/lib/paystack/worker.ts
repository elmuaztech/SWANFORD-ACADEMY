/**
 * Swanford Academy — PostgreSQL-Backed Durable Webhook Worker
 * Master Specification Reference: Sections 6, 7, 15, 24
 *
 * Requirements:
 * 1. Safe concurrent execution using PostgreSQL row locks (`SELECT ... FOR UPDATE SKIP LOCKED`).
 * 2. Exponential backoff retry mechanism.
 * 3. Survives process crash, restart, network blips.
 * 4. Stale-lock reaper recovering hung/interrupted processing locks.
 * 5. Multi-environment support: Local daemon, Vercel cron, Hostinger PM2/systemd.
 */

import { prisma } from "@/lib/prisma";
import { Prisma, WebhookEventStatus } from "@prisma/client";
import {
  processVerifiedTransaction,
  handleGatewayReversalOrRefund,
  reconcileSettlementBatch,
} from "./service";
import { PaystackSettlementData, PaystackTransactionData } from "./types";

export interface ProcessBatchResult {
  claimed: number;
  processed: number;
  failed: number;
  fatal: number;
}

/**
 * Claims and processes a batch of pending webhook events with row-level locks.
 */
export async function processPendingWebhookEvents(
  batchSize = 10,
  workerId = `worker-${process.pid || 1}`,
  client: Prisma.TransactionClient | typeof prisma = prisma,
  targetEventId?: string
): Promise<ProcessBatchResult> {
  const stats: ProcessBatchResult = {
    claimed: 0,
    processed: 0,
    failed: 0,
    fatal: 0,
  };

  // 1. Claim events atomically using SELECT ... FOR UPDATE SKIP LOCKED
  const claimedEvents = targetEventId
    ? await client.$queryRaw<
        Array<{
          id: string;
          event_type: string;
          payload_json: Record<string, unknown>;
          reference: string | null;
          attempts: number;
          max_attempts: number;
        }>
      >`
        SELECT id, event_type, payload_json, reference, attempts, max_attempts
        FROM payment_webhook_events
        WHERE id = ${targetEventId}::uuid
        FOR UPDATE SKIP LOCKED;
      `
    : await client.$queryRaw<
        Array<{
          id: string;
          event_type: string;
          payload_json: Record<string, unknown>;
          reference: string | null;
          attempts: number;
          max_attempts: number;
        }>
      >`
        SELECT id, event_type, payload_json, reference, attempts, max_attempts
        FROM payment_webhook_events
        WHERE status IN ('QUEUED', 'FAILED_RETRYABLE')
          AND (next_retry_at IS NULL OR next_retry_at <= NOW())
          AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '5 minutes')
        ORDER BY created_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED;
      `;

  if (!claimedEvents || claimedEvents.length === 0) {
    return stats;
  }

  stats.claimed = claimedEvents.length;

  // 2. Mark claimed rows as PROCESSING
  const claimedIds = claimedEvents.map((e) => e.id);
  await client.$executeRaw`
    UPDATE payment_webhook_events
    SET status = 'PROCESSING',
        locked_at = NOW(),
        locked_by = ${workerId},
        last_attempt_at = NOW()
    WHERE id = ANY(${claimedIds}::uuid[]);
  `;

  // 3. Process each event with isolated error handling
  for (const event of claimedEvents) {
    const payload = event.payload_json || {};
    const eventType = event.event_type;
    const maxAttempts = Number(event.max_attempts ?? (event as Record<string, unknown>).maxAttempts ?? 5);
    const currentAttempt = Number(event.attempts ?? 0) + 1;

    try {
      if (eventType === "charge.success") {
        const data = (payload.data as PaystackTransactionData) || {};
        const ref = event.reference || data.reference;
        if (!ref) {
          throw new Error("charge.success payload missing payment reference.");
        }
        await processVerifiedTransaction(ref, data, { client });
      } else if (
        eventType === "refund.processed" ||
        eventType === "charge.dispute.create"
      ) {
        const data = (payload.data as PaystackTransactionData) || {};
        await handleGatewayReversalOrRefund(data, client);
      } else if (eventType === "settlement.create") {
        const data = (payload.data as unknown as PaystackSettlementData) || {};
        await reconcileSettlementBatch(data, client);
      }

      // Mark successful
      await client.paymentWebhookEvent.update({
        where: { id: event.id },
        data: {
          status: WebhookEventStatus.PROCESSED,
          processed: true,
          processedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          attempts: currentAttempt,
          errorMessage: null,
        },
      });

      stats.processed++;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown worker error";

      if (currentAttempt >= maxAttempts) {
        // Exceeded max attempts: transition to FAILED_FATAL
        await client.paymentWebhookEvent.update({
          where: { id: event.id },
          data: {
            status: WebhookEventStatus.FAILED_FATAL,
            lockedAt: null,
            lockedBy: null,
            attempts: currentAttempt,
            errorMessage: `Fatal: Exceeded ${maxAttempts} attempts. Error: ${errorMessage}`,
          },
        });
        stats.fatal++;
      } else {
        // Retryable: calculate exponential backoff (e.g. 30s, 60s, 120s, 240s)
        const delaySeconds = Math.pow(2, currentAttempt) * 30;
        const nextRetryAt = new Date(Date.now() + delaySeconds * 1000);

        await client.paymentWebhookEvent.update({
          where: { id: event.id },
          data: {
            status: WebhookEventStatus.FAILED_RETRYABLE,
            lockedAt: null,
            lockedBy: null,
            attempts: currentAttempt,
            nextRetryAt,
            errorMessage,
          },
        });
        stats.failed++;
      }
    }
  }

  return stats;
}

/**
 * Recovers stale locks left behind by crashed worker processes.
 */
export async function reapStaleLocks(staleMinutes = 5, client = prisma): Promise<number> {
  const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000);
  const result = await client.paymentWebhookEvent.updateMany({
    where: {
      status: WebhookEventStatus.PROCESSING,
      lockedAt: { lt: cutoff },
    },
    data: {
      status: WebhookEventStatus.QUEUED,
      lockedAt: null,
      lockedBy: null,
    },
  });
  return result.count;
}
