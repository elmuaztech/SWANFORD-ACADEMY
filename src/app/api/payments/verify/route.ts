import { NextRequest, NextResponse } from "next/server";
import { verifyTransaction, processVerifiedTransaction } from "@/lib/paystack";
import { toUserFacingError } from "@/lib/ui/error_messages";
import { prisma } from "@/lib/prisma";
import { GatewayTransactionStatus } from "@prisma/client";
import { checkRateLimit, getClientIp } from "@/lib/security/rate_limiter";

export const dynamic = "force-dynamic";

/**
 * Payment Verification Endpoint
 * POST /api/payments/verify
 *
 * Security Controls:
 * 1. IP rate limiting against brute force and verification amplification.
 * 2. Strict regex format check on reference string.
 * 3. Local database pre-check before making any outbound API call to Paystack.
 * 4. Fast-path return for already-confirmed transactions without calling gateway.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rateLimit = checkRateLimit(`pay_verify:${ip}`, {
      windowMs: 60_000,
      maxRequests: 30,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many payment verification requests. Please wait a moment." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { reference } = body;

    if (!reference || typeof reference !== "string") {
      return NextResponse.json(
        { error: "Payment reference is required." },
        { status: 400 }
      );
    }

    const cleanRef = reference.trim();
    // Validate reference format (alphanumeric, hyphens, underscores, dots; length 5-100)
    if (!/^[a-zA-Z0-9_\-\.]{5,100}$/.test(cleanRef)) {
      return NextResponse.json(
        { error: "Invalid payment reference format." },
        { status: 400 }
      );
    }

    // 1. Authoritative Local Pre-Check: Prevent amplification proxy attacks
    const existingTx = await prisma.paymentTransaction.findUnique({
      where: { gatewayReference: cleanRef },
      include: {
        schoolPayment: {
          include: { receipt: true },
        },
      },
    });

    if (!existingTx) {
      return NextResponse.json(
        { error: "Payment reference not found or unauthorized." },
        { status: 404 }
      );
    }

    // 2. Fast-Path: If already successful, return verified local record immediately
    if (existingTx.status === GatewayTransactionStatus.SUCCESS) {
      return NextResponse.json(
        {
          success: true,
          status: "SUCCESS",
          reference: existingTx.gatewayReference,
          targetType: existingTx.applicationId ? "APPLICATION_FEE" : "INVOICE",
          targetId: existingTx.applicationId || existingTx.invoiceId,
          amountKobo: existingTx.amountKobo.toString(),
          receiptNumber: existingTx.schoolPayment?.receipt?.receiptNumber || null,
          message: "Payment transaction already verified and confirmed.",
          alreadyProcessed: true,
        },
        { status: 200 }
      );
    }

    // 3. Fetch gateway verification from Paystack only for valid local pending transaction
    const gatewayVerify = await verifyTransaction(cleanRef);

    // 4. Process transaction under atomic database row locks
    const result = await processVerifiedTransaction(
      cleanRef,
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
