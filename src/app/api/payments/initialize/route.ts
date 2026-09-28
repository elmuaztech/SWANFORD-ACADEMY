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
    const forwardedProto = req.headers.get("x-forwarded-proto");
    const protocol = forwardedProto || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    const allowedOrigin = `${protocol}://${host}`;

    let validatedCallbackUrl: string | undefined = undefined;
    if (callbackUrl && typeof callbackUrl === "string") {
      const trimmed = callbackUrl.trim();
      if (trimmed.startsWith("/")) {
        validatedCallbackUrl = `${allowedOrigin}${trimmed}`;
      } else {
        try {
          const parsed = new URL(trimmed);
          const isSameOrigin = parsed.origin === allowedOrigin;
          const isAppUrlOrigin = process.env.APP_URL ? parsed.origin === new URL(process.env.APP_URL).origin : false;
          if (isSameOrigin || isAppUrlOrigin) {
            validatedCallbackUrl = parsed.toString();
          } else {
            return NextResponse.json(
              { error: "Invalid payment callback destination." },
              { status: 400 }
            );
          }
        } catch {
          return NextResponse.json(
            { error: "Invalid payment callback format." },
            { status: 400 }
          );
        }
      }
    }

    if (targetType === PaymentTargetType.APPLICATION_FEE) {
      const result = await initializeApplicationPayment({
        sessionToken,
        callbackUrl: validatedCallbackUrl || `${allowedOrigin}/admissions/pay/callback`,
      });
      return NextResponse.json(result, { status: 200 });
    } else if (targetType === PaymentTargetType.INVOICE) {
      const result = await initializeInvoicePayment({
        sessionToken,
        callbackUrl: validatedCallbackUrl || `${allowedOrigin}/finance/pay/callback`,
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
