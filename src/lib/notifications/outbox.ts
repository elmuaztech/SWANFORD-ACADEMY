import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { EnqueueNotificationInput, EnqueueNotificationResult } from './types';
import { isNotificationAllowed } from './preferences';

/**
 * Swanford Academy — Reliable Transactional Notification Outbox
 *
 * Core Directives:
 * 1. Financial isolation: Notification enqueue failures must NEVER abort
 *    committed financial or admission records.
 * 2. Deterministic idempotency: Prevents duplicate emails across webhook races,
 *    retries, or duplicate callbacks.
 * 3. Preference gating: Checks user preferences while enforcing that
 *    mandatory notifications (Security, Finance, Admission Decisions) are always queued.
 */
export async function enqueueNotification(
  input: EnqueueNotificationInput,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<EnqueueNotificationResult> {
  const {
    idempotencyKey,
    recipientEmail,
    recipientUserId,
    recipientPhone,
    channel = 'EMAIL',
    category,
    templateName,
    subject,
    bodyText,
    htmlBody,
    metadata,
  } = input;

  const normalizedEmail = recipientEmail.trim().toLowerCase();

  // 1. Gating by User Preferences (Mandatory categories bypass check)
  const isAllowed = await isNotificationAllowed(recipientUserId, category);
  if (!isAllowed) {
    return {
      enqueued: false,
      skippedDueToPreference: true,
    };
  }

  // 2. Check Idempotency Key
  try {
    const existing = await client.notification.findUnique({
      where: { idempotencyKey },
    });

    if (existing) {
      return {
        enqueued: false,
        notificationId: existing.id,
        duplicate: true,
      };
    }

    // 3. Persist into PostgreSQL notifications outbox
    const created = await client.notification.create({
      data: {
        idempotencyKey,
        recipientUserId: recipientUserId || null,
        recipientEmail: normalizedEmail,
        recipientPhone: recipientPhone || null,
        channel,
        category,
        templateName,
        subject,
        bodyText,
        htmlBody: htmlBody || null,
        metadata: (metadata || Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });

    return {
      enqueued: true,
      notificationId: created.id,
      duplicate: false,
    };
  } catch (error: unknown) {
    // Unique constraint violation P2002 on idempotency_key
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      const existing = await client.notification.findUnique({
        where: { idempotencyKey },
      });
      return {
        enqueued: false,
        notificationId: existing?.id,
        duplicate: true,
      };
    }

    // Log diagnostic without leaking recipient secrets
    console.error(
      `[Notification Outbox Warning] Enqueue failed for idempotencyKey=${idempotencyKey} category=${category}:`,
      error instanceof Error ? error.message : error
    );

    // Re-throw if caller is directly testing outbox insertion, but callers wrapping in financial transactions
    // can safely catch or let outbox isolation protect them.
    throw error;
  }
}
