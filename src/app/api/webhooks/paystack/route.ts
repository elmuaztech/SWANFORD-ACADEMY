import { NextRequest, NextResponse, after } from "next/server";
import { ingestWebhookEvent, processPendingWebhookEvents, WebhookVerificationError } from "@/lib/paystack";

export const dynamic = "force-dynamic";

/**
 * Paystack Webhook Handler
 * POST /api/webhooks/paystack
 *
 * Requirements:
 * 1. Fast response: validates HMAC-SHA512 signature, persists event, returns HTTP 200 promptly.
 * 2. Does NOT perform heavy financial processing synchronously in this request.
 * 3. Triggers background worker execution non-blockingly using Next.js after() to survive serverless freeze.
 */
export async function POST(req: NextRequest) {
  try {
    const MAX_WEBHOOK_BODY_BYTES = 256 * 1024; // 256 KB max

    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_WEBHOOK_BODY_BYTES) {
      return NextResponse.json(
        { error: "Webhook payload exceeds maximum size limit (256 KB)." },
        { status: 413 }
      );
    }

    const signature = req.headers.get("x-paystack-signature");
    if (!signature) {
      return NextResponse.json(
        { error: "Missing x-paystack-signature header." },
        { status: 401 }
      );
    }

    const rawBody = await req.text();
    if (rawBody.length > MAX_WEBHOOK_BODY_BYTES) {
      return NextResponse.json(
        { error: "Webhook payload exceeds maximum size limit (256 KB)." },
        { status: 413 }
      );
    }

    // Ingest event into PostgreSQL durable queue
    const result = await ingestWebhookEvent(rawBody, signature);

    // Kicks the durable worker asynchronously without blocking the HTTP 200 response
    // Using Next.js after() ensures the serverless runtime on Vercel does not freeze execution mid-flight
    if (typeof after === "function") {
      after(async () => {
        try {
          await processPendingWebhookEvents(10);
        } catch (err) {
          console.error("[Paystack Webhook Worker Async Error]:", err);
        }
      });
    } else {
      processPendingWebhookEvents(10).catch((err) => {
        console.error("[Paystack Webhook Worker Async Error]:", err);
      });
    }

    return NextResponse.json(
      {
        received: true,
        duplicate: result.duplicate,
        eventId: result.eventId,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof WebhookVerificationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    console.error("[Paystack Webhook Error]:", error);
    return NextResponse.json(
      { error: "Webhook processing error." },
      { status: 400 }
    );
  }
}
