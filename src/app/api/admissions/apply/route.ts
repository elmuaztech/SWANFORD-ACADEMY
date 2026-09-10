import { NextRequest, NextResponse } from 'next/server';
import { createDraftApplication, CreateApplicationSchema } from '@/lib/admissions/application_service';

/**
 * Swanford Academy — Public Admission Application Endpoint
 * Master Specification Reference: Section 7 (Student Profile Photo — Admission Flow)
 */
export async function POST(request: NextRequest) {
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
