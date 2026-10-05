import { NextRequest, NextResponse } from "next/server";
import { processPendingWebhookEvents, reapStaleLocks } from "@/lib/paystack";
import { verifyCronAuthorization } from "@/lib/security/cron_auth";

export const dynamic = "force-dynamic";

/**
 * Vercel Cron & Scheduled Queue Worker Trigger
 * GET /api/cron/paystack-worker
 */
export async function GET(req: NextRequest) {
  const auth = verifyCronAuthorization(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const reaped = await reapStaleLocks(5);
    const stats = await processPendingWebhookEvents(25);

    return NextResponse.json(
      {
        success: true,
        reapedLocks: reaped,
        ...stats,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("[Cron Worker Error]:", error);
    return NextResponse.json(
      { error: "Cron worker encountered an error." },
      { status: 500 }
    );
  }
}
