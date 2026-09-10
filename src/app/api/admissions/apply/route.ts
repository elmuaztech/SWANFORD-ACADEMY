import { NextRequest, NextResponse } from 'next/server';
import { createDraftApplication, CreateApplicationSchema } from '@/lib/admissions/application_service';
import { checkRateLimit, getClientIp } from '@/lib/security/rate_limiter';

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

    const application = await createDraftApplication(validated);

    return NextResponse.json({
      success: true,
      applicationId: application.id,
      applicationNumber: application.applicationNumber,
      message: 'Admission application submitted successfully.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to submit admission application.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
