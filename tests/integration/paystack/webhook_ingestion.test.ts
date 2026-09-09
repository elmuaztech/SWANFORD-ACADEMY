import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { ingestWebhookEvent, WebhookVerificationError } from '@/lib/paystack/webhook';
import { getEnv } from '@/lib/env';
import { WebhookEventStatus, GatewayProvider } from '@prisma/client';

describe('Stage 9 — Integration: Webhook Ingestion & Deduplication Engine', () => {
  const env = getEnv();
  const secretKey = env.PAYSTACK_SECRET_KEY;

  function signPayload(body: string): string {
    return crypto
      .createHmac('sha512', secretKey)
      .update(body)
      .digest('hex');
  }

  it('persists a valid webhook event durably with QUEUED status', async () => {
    const uniqueRef = `SWN-APP-test-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const payload = JSON.stringify({
      event: 'charge.success',
      id: Math.floor(Math.random() * 1000000),
      data: {
        reference: uniqueRef,
        amount: 500000,
        currency: 'NGN',
        status: 'success',
        customer: { email: 'parent@swanford.example.com' },
      },
    });

    const signature = signPayload(payload);
    const result = await ingestWebhookEvent(payload, signature);

    expect(result.received).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.eventId).toBeDefined();

    const stored = await prisma.paymentWebhookEvent.findUniqueOrThrow({
      where: { id: result.eventId },
    });

    expect(stored.gatewayProvider).toBe(GatewayProvider.PAYSTACK);
    expect(stored.eventType).toBe('charge.success');
    expect(stored.reference).toBe(uniqueRef);
    expect(stored.status).toBe(WebhookEventStatus.QUEUED);
    expect(stored.signatureVerified).toBe(true);
    expect(stored.payloadHash).toBe(crypto.createHash('sha256').update(payload).digest('hex'));
  });

  it('detects and safely deduplicates identical webhook payloads via payloadHash', async () => {
    const uniqueRef = `SWN-INV-test-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const payload = JSON.stringify({
      event: 'charge.success',
      id: 998877,
      data: {
        reference: uniqueRef,
        amount: 15000000,
        status: 'success',
      },
    });

    const signature = signPayload(payload);

    // First ingestion
    const res1 = await ingestWebhookEvent(payload, signature);
    expect(res1.received).toBe(true);
    expect(res1.duplicate).toBe(false);

    // Duplicate ingestion (replay)
    const res2 = await ingestWebhookEvent(payload, signature);
    expect(res2.received).toBe(true);
    expect(res2.duplicate).toBe(true);
    expect(res2.eventId).toBe(res1.eventId);

    // Ensure only 1 record exists in the database
    const events = await prisma.paymentWebhookEvent.findMany({
      where: { reference: uniqueRef },
    });
    expect(events.length).toBe(1);
  });

  it('rejects webhooks with invalid HMAC signatures before database write', async () => {
    const payload = JSON.stringify({ event: 'charge.success', data: { reference: 'SWN-APP-BAD' } });
    const badSignature = '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

    await expect(ingestWebhookEvent(payload, badSignature)).rejects.toThrow(WebhookVerificationError);
  });
});
