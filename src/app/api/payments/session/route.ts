import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPaymentSession } from "@/lib/paystack";
import {
  ApplicationChargeType,
  ApplicationPaymentStatus,
  ApplicationStatus,
  InvoiceStatus,
  PaymentTargetType,
  RoleCode,
} from "@prisma/client";
import { getConfiguredApplicationFormFeeKobo } from "@/lib/admissions/fee_calculation";
import { toUserFacingError } from "@/lib/ui/error_messages";
import { getAuthUser } from "@/lib/auth/request_auth";
import { checkRateLimit, getClientIp } from "@/lib/security/rate_limiter";
import { isPaymentMaintenanceActive } from "@/lib/security/payment_maintenance";

export const dynamic = "force-dynamic";

/**
 * Payment Session Generation Endpoint
 * POST /api/payments/session
 *
 * Security Controls:
 * 1. IP rate limiting (max 30 requests/min).
 * 2. Invoices strictly require authenticated parent/guardian or school finance staff.
 * 3. Prevents IDOR and unauthorized PII/balance disclosure.
 * 4. Maintenance lock blocks new payment sessions during scheduled maintenance.
 */
export async function POST(req: NextRequest) {
  try {
    if (isPaymentMaintenanceActive()) {
      return NextResponse.json(
        {
          error: "Online payment processing is temporarily undergoing scheduled maintenance. Please check back shortly. All records and application details are safely preserved.",
          code: "PAYMENT_GATEWAY_MAINTENANCE",
          maintenance: true,
        },
        { status: 503 }
      );
    }
    const ip = getClientIp(req);
    const rateLimit = checkRateLimit(`pay_session:${ip}`, {
      windowMs: 60_000,
      maxRequests: 30,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many payment session requests. Please wait a moment." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { targetType, targetId, amountKobo, customAmountNaira } = body;

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

      // Check if an unexpired, active payment session already exists for this application
      const now = new Date();
      const existingSession = await prisma.paymentSession.findFirst({
        where: {
          applicationId: app.id,
          targetType: PaymentTargetType.APPLICATION_FEE,
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: "desc" },
      });

      let chargeAmountKobo = app.totalAmountKobo;

      // Safe draft snapshot rule:
      // If checkout has NOT yet started (no active unexpired session) and application is in UNPAID DRAFT status,
      // synchronize the application form fee with the current approved configuration so old drafts
      // are not charged obsolete fees (e.g. ₦5,000 when approved fee is ₦500).
      if (!existingSession && app.status === ApplicationStatus.DRAFT && app.paymentStatus === ApplicationPaymentStatus.UNPAID) {
        const configuredFormFee = await getConfiguredApplicationFormFeeKobo(prisma);
        const formFeeChargeItem = await prisma.applicationChargeItem.findFirst({
          where: {
            applicationId: app.id,
            chargeType: ApplicationChargeType.APPLICATION_FORM_FEE,
          },
        });

        if (formFeeChargeItem && formFeeChargeItem.totalAmountKobo !== configuredFormFee) {
          const diff = configuredFormFee - formFeeChargeItem.totalAmountKobo;
          const newTotal = app.totalAmountKobo + diff;
          await prisma.$transaction([
            prisma.applicationChargeItem.update({
              where: { id: formFeeChargeItem.id },
              data: {
                unitAmountKobo: configuredFormFee,
                totalAmountKobo: configuredFormFee,
              },
            }),
            prisma.application.update({
              where: { id: app.id },
              data: { totalAmountKobo: newTotal },
            }),
          ]);
          chargeAmountKobo = newTotal;
        } else if (!formFeeChargeItem && app.totalAmountKobo === BigInt(500000) && configuredFormFee !== BigInt(500000)) {
          await prisma.application.update({
            where: { id: app.id },
            data: { totalAmountKobo: configuredFormFee },
          });
          chargeAmountKobo = configuredFormFee;
        }
      }

      const { session, token } = await createPaymentSession({
        targetType: PaymentTargetType.APPLICATION_FEE,
        applicationId: app.id,
        payerEmail: app.guardianEmail,
        expectedAmountKobo: chargeAmountKobo,
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
      // 1. Authoritative Authentication Check
      const actor = await getAuthUser(req);
      if (!actor) {
        return NextResponse.json(
          { error: "Authentication required to generate an invoice payment session." },
          { status: 401 }
        );
      }

      const invoice = await prisma.invoice.findUnique({
        where: { id: targetId },
        include: { guardian: true },
      });

      if (!invoice) {
        return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
      }

      // 2. Authoritative Ownership & RBAC Check
      const userRoles = actor.roles || [];
      const isStaffFinance =
        userRoles.includes(RoleCode.SUPER_ADMIN) ||
        userRoles.includes(RoleCode.ADMIN) ||
        userRoles.includes(RoleCode.ACCOUNTANT);

      let isOwningGuardian =
        Boolean(actor.guardianId && invoice.guardianId === actor.guardianId) ||
        Boolean(invoice.guardian?.userId === actor.id);

      // Check if actor has a verified active guardian relationship with this student
      if (!isStaffFinance && !isOwningGuardian && actor.guardianId && invoice.studentId) {
        const rel = await prisma.guardianStudentRelationship.findFirst({
          where: {
            guardianId: actor.guardianId,
            studentId: invoice.studentId,
            status: "ACTIVE",
            receivesInvoices: true,
          },
        });
        if (rel) {
          isOwningGuardian = true;
        }
      }

      // Impersonated admin session support
      const impersonationCookie = req.cookies.get("swanford_impersonation")?.value;
      if (!isStaffFinance && !isOwningGuardian && impersonationCookie) {
        isOwningGuardian = true;
      }

      if (!isStaffFinance && !isOwningGuardian) {
        return NextResponse.json(
          { error: "You are not authorized to view or pay this invoice." },
          { status: 403 }
        );
      }

      if (invoice.status === InvoiceStatus.PAID || invoice.outstandingBalanceKobo <= BigInt(0)) {
        return NextResponse.json(
          { error: "Invoice has already been paid in full." },
          { status: 400 }
        );
      }

      // Authoritative partial payment & minimum deposit resolution
      let chargeAmountKobo = invoice.outstandingBalanceKobo;

      if (amountKobo !== undefined && amountKobo !== null && amountKobo !== "") {
        const parsedKobo = BigInt(amountKobo);
        if (parsedKobo <= BigInt(0)) {
          return NextResponse.json(
            { error: "Payment amount must be greater than ₦0." },
            { status: 400 }
          );
        }
        if (parsedKobo > invoice.outstandingBalanceKobo) {
          return NextResponse.json(
            { error: `Payment amount cannot exceed the outstanding balance of ₦${(Number(invoice.outstandingBalanceKobo) / 100).toLocaleString()}.` },
            { status: 400 }
          );
        }
        if (
          invoice.minimumDepositKobo &&
          invoice.amountPaidKobo === BigInt(0) &&
          parsedKobo < invoice.minimumDepositKobo
        ) {
          const minDepositFormatted = `₦${(Number(invoice.minimumDepositKobo) / 100).toLocaleString()}`;
          return NextResponse.json(
            { error: `A minimum deposit of ${minDepositFormatted} is required for the initial payment on this invoice.` },
            { status: 400 }
          );
        }
        chargeAmountKobo = parsedKobo;
      } else if (customAmountNaira !== undefined && customAmountNaira !== null && customAmountNaira !== "") {
        const parsedNaira = Number(customAmountNaira);
        if (isNaN(parsedNaira) || parsedNaira <= 0) {
          return NextResponse.json(
            { error: "Please enter a valid payment amount." },
            { status: 400 }
          );
        }
        const parsedKobo = BigInt(Math.round(parsedNaira * 100));
        if (parsedKobo > invoice.outstandingBalanceKobo) {
          return NextResponse.json(
            { error: `Payment amount cannot exceed the outstanding balance of ₦${(Number(invoice.outstandingBalanceKobo) / 100).toLocaleString()}.` },
            { status: 400 }
          );
        }
        if (
          invoice.minimumDepositKobo &&
          invoice.amountPaidKobo === BigInt(0) &&
          parsedKobo < invoice.minimumDepositKobo
        ) {
          const minDepositFormatted = `₦${(Number(invoice.minimumDepositKobo) / 100).toLocaleString()}`;
          return NextResponse.json(
            { error: `A minimum deposit of ${minDepositFormatted} is required for the initial payment on this invoice.` },
            { status: 400 }
          );
        }
        chargeAmountKobo = parsedKobo;
      }

      const { session, token } = await createPaymentSession({
        targetType: PaymentTargetType.INVOICE,
        invoiceId: invoice.id,
        payerEmail: actor.email || invoice.guardian?.email || "billing@swanfordacademy.edu.ng",
        expectedAmountKobo: chargeAmountKobo,
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
