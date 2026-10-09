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
      const tx = await prisma.paymentTransaction.findUnique({
        where: { gatewayReference: cleanRef },
      });

      if (tx && tx.status === 'SUCCESS') {
        await prisma.application.update({
          where: { id: draft.id },
          data: {
            paymentStatus: 'PAYMENT_CONFIRMED',
            paymentReference: cleanRef,
            amountPaidKobo: draft.totalAmountKobo,
          },
        });

        await prisma.paymentTransaction.update({
          where: { id: tx.id },
          data: { applicationId: draft.id },
        });
      }
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
