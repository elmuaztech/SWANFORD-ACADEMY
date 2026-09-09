import { NextRequest, NextResponse } from "next/server";
import { verifyTransaction, processVerifiedTransaction } from "@/lib/paystack";
import { toUserFacingError } from "@/lib/ui/error_messages";

export const dynamic = "force-dynamic";

/**
 * Payment Verification Endpoint
 * POST /api/payments/verify
 *
 * Used by customer redirect callback pages.
 * Validates with Paystack and runs server-authoritative state transition.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { reference } = body;

    if (!reference || typeof reference !== "string") {
      return NextResponse.json(
        { error: "Payment reference is required." },
        { status: 400 }
      );
    }

    // 1. Fetch gateway verification from Paystack
    const gatewayVerify = await verifyTransaction(reference.trim());

    // 2. Process transaction under atomic database row locks
    const result = await processVerifiedTransaction(
      reference.trim(),
      gatewayVerify.data
    );

    return NextResponse.json(
      {
        success: result.success,
        status: result.status,
        reference: result.reference,
        targetType: result.targetType,
        targetId: result.targetId,
        amountKobo: result.amountKobo.toString(),
        receiptNumber: result.receiptNumber,
        message: result.message,
        alreadyProcessed: result.alreadyProcessed,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const translated = toUserFacingError(error);
    return NextResponse.json(
      { error: translated.message, title: translated.title },
      { status: 400 }
    );
  }
}
