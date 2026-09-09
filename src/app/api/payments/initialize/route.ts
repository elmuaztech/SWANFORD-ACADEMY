import { NextRequest, NextResponse } from "next/server";
import {
  initializeApplicationPayment,
  initializeInvoicePayment,
} from "@/lib/paystack";
import { PaymentTargetType } from "@prisma/client";
import { toUserFacingError } from "@/lib/ui/error_messages";

export const dynamic = "force-dynamic";

/**
 * Payment Initialization Endpoint
 * POST /api/payments/initialize
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionToken, targetType, callbackUrl } = body;

    if (!sessionToken || typeof sessionToken !== "string") {
      return NextResponse.json(
        { error: "Payment session token is required." },
        { status: 400 }
      );
    }

    const host = req.headers.get("host") || "localhost:3000";
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const defaultCallback = `${protocol}://${host}/admissions/pay/callback`;

    if (targetType === PaymentTargetType.APPLICATION_FEE) {
      const result = await initializeApplicationPayment({
        sessionToken,
        callbackUrl: callbackUrl || defaultCallback,
      });
      return NextResponse.json(result, { status: 200 });
    } else if (targetType === PaymentTargetType.INVOICE) {
      const result = await initializeInvoicePayment({
        sessionToken,
        callbackUrl: callbackUrl || `${protocol}://${host}/finance/pay/callback`,
      });
      return NextResponse.json(result, { status: 200 });
    } else {
      return NextResponse.json(
        { error: "Invalid payment target type." },
        { status: 400 }
      );
    }
  } catch (error: unknown) {
    const translated = toUserFacingError(error);
    return NextResponse.json(
      { error: translated.message, title: translated.title },
      { status: 400 }
    );
  }
}
