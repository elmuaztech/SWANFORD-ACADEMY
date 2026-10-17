/**
 * Swanford Academy — Paystack Webhook Ingestion & Signature Verification
 * Master Specification Reference: Sections 6, 7, 15, 24
 *
 * Mandatory Requirements:
 * 1. Verify `x-paystack-signature` with HMAC-SHA512 using PAYSTACK_SECRET_KEY.
 * 2. Persist event durably before returning HTTP 200.
 * 3. Use SHA-256 raw-body fingerprinting (`payloadHash`) for duplicate event protection.
 * 4. Acknowledge HTTP 200 promptly without executing heavy financial processing synchronously.
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { GatewayProvider, Prisma, WebhookEventStatus } from "@prisma/client";

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

/**
 * Validates HMAC-SHA512 signature from x-paystack-signature header.
 */
export function verifyPaystackSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secretKeyOverride?: string
): boolean {
  if (!signatureHeader || typeof signatureHeader !== "string") {
    return false;
  }

  const env = getEnv();
  const candidateKeys: string[] = [];

  if (secretKeyOverride && secretKeyOverride.trim()) {
    candidateKeys.push(secretKeyOverride.trim());
  } else {
    // Paystack officially signs webhooks using PAYSTACK_SECRET_KEY
    if (env.PAYSTACK_SECRET_KEY && env.PAYSTACK_SECRET_KEY.trim()) {
      candidateKeys.push(env.PAYSTACK_SECRET_KEY.trim());
    }
    // Also support custom webhook secret if configured
    if (process.env.PAYSTACK_WEBHOOK_SECRET && process.env.PAYSTACK_WEBHOOK_SECRET.trim()) {
      const customSecret = process.env.PAYSTACK_WEBHOOK_SECRET.trim();
      if (!candidateKeys.includes(customSecret)) {
        candidateKeys.push(customSecret);
      }
    }
  }

  if (candidateKeys.length === 0) {
    return false;
  }

  const providedSignature = signatureHeader.trim().toLowerCase();
  if (!/^[0-9a-f]{128}$/i.test(providedSignature)) {
    return false;
  }
  const providedBuf = Buffer.from(providedSignature, "hex");

  for (const key of candidateKeys) {
    const expectedSignature = crypto
      .createHmac("sha512", key)
      .update(rawBody)
      .digest("hex");

    const expectedBuf = Buffer.from(expectedSignature.toLowerCase(), "hex");

    if (providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf)) {
      return true;
    }
  }

  return false;
}

export interface IngestWebhookResult {
  received: boolean;
  duplicate: boolean;
  eventId: string;
}

/**
 * Persists an incoming webhook payload into the durable queue.
 * Guarantees idempotency via raw-body SHA-256 hash.
 */
export async function ingestWebhookEvent(
  rawBody: string,
  signatureHeader: string | null | undefined,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<IngestWebhookResult> {
  // 1. Validate signature
  const isValid = verifyPaystackSignature(rawBody, signatureHeader);
  if (!isValid) {
    throw new WebhookVerificationError("Invalid or missing Paystack webhook signature.");
  }

  // 2. Compute deterministic SHA-256 fingerprint of raw body
  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");

  // 3. Fast idempotency check against existing payload hash
  const existingEvent = await client.paymentWebhookEvent.findUnique({
    where: { payloadHash },
  });

  if (existingEvent) {
    return {
      received: true,
      duplicate: true,
      eventId: existingEvent.id,
    };
  }

  // 4. Parse payload to extract reference and event type
  let parsedPayload: Record<string, unknown>;
  try {
    parsedPayload = JSON.parse(rawBody);
  } catch {
    throw new WebhookVerificationError("Malformed JSON payload in webhook body.");
  }

  const eventType = typeof parsedPayload.event === "string" ? parsedPayload.event : "unknown";
  const data = (parsedPayload.data as Record<string, unknown>) || {};
  const reference = typeof data.reference === "string" ? data.reference : null;

  // Paystack event ID if provided, otherwise fallback
  const eventId =
    typeof parsedPayload.id === "string" || typeof parsedPayload.id === "number"
      ? String(parsedPayload.id)
      : null;

  // 5. Persist with status QUEUED
  const saved = await client.paymentWebhookEvent.create({
    data: {
      gatewayProvider: GatewayProvider.PAYSTACK,
      eventId,
      eventType,
      payloadHash,
      payloadJson: parsedPayload as Prisma.InputJsonValue,
      signatureVerified: true,
      status: WebhookEventStatus.QUEUED,
      reference,
      attempts: 0,
      maxAttempts: 5,
    },
  });

  return {
    received: true,
    duplicate: false,
    eventId: saved.id,
  };
}
