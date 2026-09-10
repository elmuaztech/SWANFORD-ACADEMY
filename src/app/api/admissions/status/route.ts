import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, getClientIp } from '@/lib/security/rate_limiter';
import { ApplicationPaymentStatus, ApplicationStatus } from '@prisma/client';

/**
 * Swanford Academy — Secure Public Admission Status Verification Endpoint
 * Master Specification Reference: Work Package D (Security, Privacy & Dual Contact Verification)
 *
 * Security Invariants:
 * 1. Requires DUAL verification: Application Number + Guardian Email OR Phone.
 * 2. Sliding window rate limiting to block automated enumeration attacks.
 * 3. Generic 404 response on any mismatch to prevent identity discovery.
 * 4. Minimal safe data returned (Status label, payment status, applied programmes, receipt if confirmed).
 * 5. Zero internal database UUIDs, private guardian contact details, or audit logs exposed.
 */

// Human-readable status mapping for public display
const STATUS_DISPLAY_MAP: Record<ApplicationStatus, string> = {
  [ApplicationStatus.DRAFT]: 'Draft Application',
  [ApplicationStatus.SUBMITTED]: 'Application Submitted',
  [ApplicationStatus.UNDER_REVIEW]: 'Under Academic Review',
  [ApplicationStatus.CONFLICT_REVIEW]: 'Under Academic Review',
  [ApplicationStatus.APPROVED]: 'Application Approved',
  [ApplicationStatus.PARTIALLY_APPROVED]: 'Partially Approved',
  [ApplicationStatus.REJECTED]: 'Application Not Successful',
  [ApplicationStatus.ENROLLED]: 'Matriculated & Enrolled',
};

const PAYMENT_STATUS_DISPLAY_MAP: Record<ApplicationPaymentStatus, string> = {
  [ApplicationPaymentStatus.UNPAID]: 'Payment Pending',
  [ApplicationPaymentStatus.PAYMENT_PENDING]: 'Payment Pending Verification',
  [ApplicationPaymentStatus.PAYMENT_CONFIRMED]: 'Payment Confirmed',
  [ApplicationPaymentStatus.WAIVED]: 'Fee Waived',
  [ApplicationPaymentStatus.REFUNDED]: 'Fee Refunded',
};

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // 1. Rate Limiting: Max 15 status lookups per minute per IP
  const rateLimit = checkRateLimit(`status_lookup:${ip}`, {
    windowMs: 60_000,
    maxRequests: 15,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many status inquiries. Please wait a moment before trying again.' },
      {
        status: 429,
        headers: {
          'Retry-After': Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString(),
        },
      }
    );
  }

  try {
    const body = await request.json();
    const applicationNumber = typeof body.applicationNumber === 'string' ? body.applicationNumber.trim() : '';
    const contactVerification = typeof body.contactVerification === 'string' ? body.contactVerification.trim().toLowerCase() : '';

    if (!applicationNumber || !contactVerification) {
      return NextResponse.json(
        { error: 'Application number and registered guardian email or phone are required.' },
        { status: 400 }
      );
    }

    // 2. Query application with dual contact verification
    const application = await prisma.application.findFirst({
      where: {
        applicationNumber: { equals: applicationNumber, mode: 'insensitive' },
        OR: [
          { guardianEmail: { equals: contactVerification, mode: 'insensitive' } },
          { guardianPhone: { equals: contactVerification, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        applicationNumber: true,
        applicantFirstName: true,
        applicantGender: true,
        status: true,
        paymentStatus: true,
        paymentReference: true,
        amountPaidKobo: true,
        createdAt: true,
        programmeSelections: {
          select: {
            programme: {
              select: { name: true, code: true },
            },
            status: true,
          },
        },
        admissionCycle: {
          select: { name: true },
        },
      },
    });

    // 3. Generic 404 response on mismatch to prevent enumeration
    if (!application) {
      return NextResponse.json(
        {
          error:
            'No matching admission application was found with the provided application number and contact details. Please check your credentials.',
        },
        { status: 404 }
      );
    }

    // 4. Return safe public payload without leaking private data
    const isPaymentConfirmed = application.paymentStatus === ApplicationPaymentStatus.PAYMENT_CONFIRMED;

    return NextResponse.json({
      success: true,
      applicationNumber: application.applicationNumber,
      applicantName: `${application.applicantFirstName}`,
      admissionCycleName: application.admissionCycle.name,
      status: application.status,
      statusLabel: STATUS_DISPLAY_MAP[application.status] || 'Application Processing',
      paymentStatus: application.paymentStatus,
      paymentStatusLabel: PAYMENT_STATUS_DISPLAY_MAP[application.paymentStatus] || 'Pending',
      submittedAt: application.createdAt,
      programmes: application.programmeSelections.map((ps) => ({
        name: ps.programme.name,
        code: ps.programme.code,
      })),
      receipt: isPaymentConfirmed
        ? {
            receiptNumber: application.paymentReference ? `REC-${application.applicationNumber}` : null,
            amountPaidKobo: application.amountPaidKobo?.toString() || '0',
            reference: application.paymentReference,
          }
        : null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unable to check application status.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
