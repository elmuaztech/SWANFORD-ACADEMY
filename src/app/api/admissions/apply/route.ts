import { NextRequest, NextResponse } from 'next/server';
import {
  createDraftApplication,
  submitApplication,
  CreateApplicationSchema,
} from '@/lib/admissions/application_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { checkRateLimit, getClientIp } from '@/lib/security/rate_limiter';
import { toUserFacingError } from '@/lib/ui/error_messages';
import { prisma } from '@/lib/prisma';
import { ApplicationPaymentStatus, GatewayTransactionStatus } from '@prisma/client';

/**
 * Swanford Academy — Public Admission Application Endpoint
 * Master Specification Reference: Section 7 (Student Profile Photo — Admission Flow) & Work Package D
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // Rate Limiting: Max 10 application submissions per 5 minutes per IP
  const rateLimit = checkRateLimit(`application_submit:${ip}`, {
    windowMs: 5 * 60 * 1000,
    maxRequests: 10,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many application submission attempts. Please try again later.' },
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
    const validated = CreateApplicationSchema.parse(body);

    // If submitted from public applicant web form, enforce all compulsory form fields:
    // Pupil Date of Birth, Passport Photograph, State of Origin, LGA, and Guardian Occupation
    if (body.isWebFormSubmission) {
      if (!body.applicantDob) {
        return NextResponse.json({ error: 'Pupil Date of Birth is compulsory.' }, { status: 400 });
      }
      if (!body.profilePhotoId) {
        return NextResponse.json({ error: 'Pupil Passport Photograph is compulsory. Please upload a passport photo.' }, { status: 400 });
      }
      if (!body.stateOfOrigin || !body.stateOfOrigin.trim()) {
        return NextResponse.json({ error: 'State of Origin is compulsory.' }, { status: 400 });
      }
      if (!body.lga || !body.lga.trim()) {
        return NextResponse.json({ error: 'Local Government Area (LGA) is compulsory.' }, { status: 400 });
      }
      if (!body.guardianOccupation || !body.guardianOccupation.trim()) {
        return NextResponse.json({ error: 'Parent / Guardian Occupation is compulsory.' }, { status: 400 });
      }
    }
    const draft = await createDraftApplication(validated);

    // If pre-verified payment reference is provided, link payment and mark confirmed
    if (body.paymentReference && typeof body.paymentReference === 'string') {
      const cleanRef = body.paymentReference.trim();

      await prisma.$transaction(async (tx) => {
        const pTx = await tx.paymentTransaction.findUnique({
          where: { gatewayReference: cleanRef },
        });

        if (!pTx) {
          throw new AuthorizationError('Payment reference not found.', 404, 'PAYMENT_NOT_FOUND');
        }

        if (pTx.status !== GatewayTransactionStatus.SUCCESS) {
          throw new AuthorizationError('Payment reference has not been verified and confirmed by the payment gateway.', 400, 'PAYMENT_NOT_CONFIRMED');
        }

        if (pTx.currency !== 'NGN') {
          throw new AuthorizationError('Invalid payment currency. Expected NGN.', 400, 'CURRENCY_MISMATCH');
        }

        if (pTx.invoiceId !== null) {
          throw new AuthorizationError('Invalid payment target: reference belongs to a school fee invoice.', 400, 'INVALID_PAYMENT_TARGET');
        }

        if (pTx.applicationId !== null) {
          throw new AuthorizationError('This payment reference has already been claimed by another admission application.', 400, 'PAYMENT_REFERENCE_REPLAY');
        }

        if (pTx.amountKobo < draft.totalAmountKobo) {
          throw new AuthorizationError(
            `Payment amount (₦${(Number(pTx.amountKobo) / 100).toLocaleString()}) is less than the required application fee (₦${(Number(draft.totalAmountKobo) / 100).toLocaleString()}).`,
            400,
            'AMOUNT_MISMATCH'
          );
        }

        // Atomically claim the payment transaction for this draft (prevents concurrent claim races)
        const claimUpdate = await tx.paymentTransaction.updateMany({
          where: {
            id: pTx.id,
            applicationId: null,
          },
          data: {
            applicationId: draft.id,
          },
        });

        if (claimUpdate.count === 0) {
          throw new AuthorizationError('Payment reference was claimed concurrently.', 409, 'PAYMENT_REFERENCE_REPLAY');
        }

        await tx.application.update({
          where: { id: draft.id },
          data: {
            paymentStatus: ApplicationPaymentStatus.PAYMENT_CONFIRMED,
            paymentReference: cleanRef,
            amountPaidKobo: pTx.amountKobo,
          },
        });

        await tx.auditLog.create({
          data: {
            action: 'APPLICATION_PAYMENT_CLAIMED',
            entityType: 'Application',
            entityId: draft.id,
            newValues: {
              reference: cleanRef,
              amountKobo: pTx.amountKobo.toString(),
            },
          },
        });
      });
    }

    const application = await submitApplication(draft.id);

    return NextResponse.json({
      success: true,
      applicationId: application.id,
      applicationNumber: application.applicationNumber,
      status: application.status,
      paymentStatus: application.paymentStatus,
      totalAmountKobo: application.totalAmountKobo.toString(),
      message: 'Admission application submitted successfully.',
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 400 }
      );
    }
    const userError = toUserFacingError(error);
    const message = userError.message || userError.title || (error instanceof Error ? error.message : 'Failed to submit admission application.');
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
