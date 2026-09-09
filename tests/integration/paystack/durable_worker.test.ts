import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import {
  processPendingWebhookEvents,
  reapStaleLocks,
} from '@/lib/paystack/worker';
import { GatewayProvider, WebhookEventStatus } from '@prisma/client';

describe('Stage 9 — Integration: Durable Webhook Worker & Lock Recovery', () => {
  it('increments attempts and calculates exponential backoff on retryable failure', async () => {
    const invalidRef = `SWN-INV-nonexistent-${Date.now()}`;
    const hash = crypto.createHash('sha256').update(`test-${Date.now()}-${Math.random()}`).digest('hex');

    const event = await prisma.paymentWebhookEvent.create({
      data: {
        gatewayProvider: GatewayProvider.PAYSTACK,
        eventType: 'charge.success',
        payloadHash: hash,
        payloadJson: {
          event: 'charge.success',
          data: { reference: invalidRef, amount: 500000 },
        },
        signatureVerified: true,
        status: WebhookEventStatus.QUEUED,
        reference: invalidRef,
        attempts: 0,
        maxAttempts: 3,
      },
    });

    const result = await processPendingWebhookEvents(10, 'worker-test-unit', prisma, event.id);
    expect(result.claimed).toBeGreaterThanOrEqual(1);

    const updated = await prisma.paymentWebhookEvent.findUniqueOrThrow({
      where: { id: event.id },
    });

    expect(updated.status).toBe(WebhookEventStatus.FAILED_RETRYABLE);
    expect(updated.attempts).toBe(1);
    expect(updated.nextRetryAt).not.toBeNull();
    expect(updated.errorMessage).toContain('not found in school records');
  });

  it('transitions event to FAILED_FATAL when maxAttempts is reached', async () => {
    const invalidRef = `SWN-INV-fatal-${Date.now()}`;
    const hash = crypto.createHash('sha256').update(`fatal-${Date.now()}-${Math.random()}`).digest('hex');

    const event = await prisma.paymentWebhookEvent.create({
      data: {
        gatewayProvider: GatewayProvider.PAYSTACK,
        eventType: 'charge.success',
        payloadHash: hash,
        payloadJson: {
          event: 'charge.success',
          data: { reference: invalidRef, amount: 500000 },
        },
        signatureVerified: true,
        status: WebhookEventStatus.FAILED_RETRYABLE,
        reference: invalidRef,
        attempts: 2,
        maxAttempts: 3,
        nextRetryAt: new Date(Date.now() - 1000), // Ready to retry now
      },
    });

    await processPendingWebhookEvents(10, 'worker-test-fatal', prisma, event.id);

    const updated = await prisma.paymentWebhookEvent.findUniqueOrThrow({
      where: { id: event.id },
    });

    expect(updated.status).toBe(WebhookEventStatus.FAILED_FATAL);
    expect(updated.attempts).toBe(3);
    expect(updated.errorMessage).toContain('Fatal: Exceeded 3 attempts');
  });

  it('recovers stranded PROCESSING locks via reapStaleLocks', async () => {
    const staleHash = crypto.createHash('sha256').update(`stale-${Date.now()}-${Math.random()}`).digest('hex');

    // Create a mock stranded event with locked_at in the past
    const staleEvent = await prisma.paymentWebhookEvent.create({
      data: {
        gatewayProvider: GatewayProvider.PAYSTACK,
        eventType: 'charge.success',
        payloadHash: staleHash,
        payloadJson: { test: true },
        signatureVerified: true,
        status: WebhookEventStatus.PROCESSING,
        lockedAt: new Date(Date.now() - 15 * 60 * 1000), // 15 mins ago
        lockedBy: 'crashed-worker-pid-999',
        attempts: 1,
        maxAttempts: 5,
      },
    });

    const reapedCount = await reapStaleLocks(5);
    expect(reapedCount).toBeGreaterThanOrEqual(1);

    const reapedEvent = await prisma.paymentWebhookEvent.findUniqueOrThrow({
      where: { id: staleEvent.id },
    });

    expect(reapedEvent.status).toBe(WebhookEventStatus.QUEUED);
    expect(reapedEvent.lockedAt).toBeNull();
    expect(reapedEvent.lockedBy).toBeNull();
  });
});
