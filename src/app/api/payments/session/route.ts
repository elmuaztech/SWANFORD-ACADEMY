import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPaymentSession } from "@/lib/paystack";
import { ApplicationPaymentStatus, InvoiceStatus, PaymentTargetType } from "@prisma/client";
import { toUserFacingError } from "@/lib/ui/error_messages";

export const dynamic = "force-dynamic";

/**
 * Payment Session Generation Endpoint
 * POST /api/payments/session
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { targetType, targetId } = body;

    if (!targetType || !targetId) {
      return NextResponse.json(
        { error: "Target type and target ID are required." },
        { status: 400 }
      );
    }

    if (targetType === PaymentTargetType.APPLICATION_FEE) {
      const app = await prisma.application.findUnique({
        where: { id: targetId },
      });

      if (!app) {
        return NextResponse.json({ error: "Application not found." }, { status: 404 });
      }

      if (app.paymentStatus === ApplicationPaymentStatus.PAYMENT_CONFIRMED) {
        return NextResponse.json(
          { error: "Application fee has already been paid and confirmed." },
          { status: 400 }
        );
      }

      const { session, token } = await createPaymentSession({
        targetType: PaymentTargetType.APPLICATION_FEE,
        applicationId: app.id,
        payerEmail: app.guardianEmail,
        expectedAmountKobo: app.totalAmountKobo,
      });

      return NextResponse.json({
        token,
        sessionId: session.id,
        expectedAmountKobo: session.expectedAmountKobo.toString(),
        payerEmail: session.payerEmail,
        currency: session.currency,
        expiresAt: session.expiresAt.toISOString(),
      });
    } else if (targetType === PaymentTargetType.INVOICE) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: targetId },
        include: { guardian: true },
      });

      if (!invoice) {
        return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
      }

      if (invoice.status === InvoiceStatus.PAID || invoice.outstandingBalanceKobo <= BigInt(0)) {
        return NextResponse.json(
          { error: "Invoice has already been paid in full." },
          { status: 400 }
        );
      }

      const { session, token } = await createPaymentSession({
        targetType: PaymentTargetType.INVOICE,
        invoiceId: invoice.id,
        payerEmail: invoice.guardian?.email || "billing@swanfordacademy.edu.ng",
        expectedAmountKobo: invoice.outstandingBalanceKobo,
      });

      return NextResponse.json({
        token,
        sessionId: session.id,
        expectedAmountKobo: session.expectedAmountKobo.toString(),
        payerEmail: session.payerEmail,
        currency: session.currency,
        expiresAt: session.expiresAt.toISOString(),
      });
    } else {
      return NextResponse.json({ error: "Invalid payment target type." }, { status: 400 });
    }
  } catch (error: unknown) {
    const translated = toUserFacingError(error);
    return NextResponse.json(
      { error: translated.message, title: translated.title },
      { status: 400 }
    );
  }
}
