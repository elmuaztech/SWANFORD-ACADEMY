import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { submitAssessment } from '@/lib/assessment/assessment_service';
import { AuthorizationError } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: assessmentId } = await params;
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    let notes: string | undefined;
    try {
      const body = await request.json();
      notes = body.notes;
    } catch {
      // Body is optional
    }

    const submitted = await submitAssessment(actor, assessmentId, notes);
    return NextResponse.json({
      success: true,
      message: 'Assessment submitted for administrative review successfully.',
      assessment: submitted,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to submit assessment.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
