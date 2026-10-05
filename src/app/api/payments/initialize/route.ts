import { NextRequest, NextResponse } from "next/server";
import {
  initializeApplicationPayment,
  initializeInvoicePayment,
} from "@/lib/paystack";
import { PaymentTargetType } from "@prisma/client";
import { toUserFacingError } from "@/lib/ui/error_messages";
import { getEnv } from "@/lib/env";

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

    const env = getEnv();
    const configuredAppUrl = new URL(env.APP_URL);
    const trustedOrigins = new Set<string>([configuredAppUrl.origin]);

    // In local development or testing, also permit standard local origins
    if (env.NODE_ENV !== "production") {
      trustedOrigins.add("http://localhost:3000");
      trustedOrigins.add("http://127.0.0.1:3000");
      trustedOrigins.add("http://localhost:3002");
    }

    const canonicalOrigin = configuredAppUrl.origin;

    let validatedCallbackUrl: string | undefined = undefined;
    if (callbackUrl && typeof callbackUrl === "string") {
      const trimmed = callbackUrl.trim();
      if (trimmed.startsWith("/")) {
        validatedCallbackUrl = `${canonicalOrigin}${trimmed}`;
      } else {
        try {
          const parsed = new URL(trimmed);
          if (trustedOrigins.has(parsed.origin)) {
            validatedCallbackUrl = parsed.toString();
          } else {
            return NextResponse.json(
              { error: "Invalid payment callback destination origin." },
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
        callbackUrl: validatedCallbackUrl || `${canonicalOrigin}/admissions/pay/callback`,
      });
      return NextResponse.json(result, { status: 200 });
    } else if (targetType === PaymentTargetType.INVOICE) {
      const result = await initializeInvoicePayment({
        sessionToken,
        callbackUrl: validatedCallbackUrl || `${canonicalOrigin}/finance/pay/callback`,
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
