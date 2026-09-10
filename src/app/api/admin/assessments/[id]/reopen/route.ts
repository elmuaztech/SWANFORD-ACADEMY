import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { reopenAssessment } from '@/lib/assessment/assessment_service';
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

    const body = await request.json();
    const { justification } = body;

    if (!justification || justification.trim().length < 5) {
      return NextResponse.json(
        { error: 'A mandatory justification (minimum 5 characters) is required to reopen a finalized assessment.' },
        { status: 400 }
      );
    }

    const reopened = await reopenAssessment(actor, assessmentId, justification.trim());
    return NextResponse.json({
      success: true,
      message: 'Assessment reopened back to DRAFT.',
      assessment: reopened,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to reopen assessment.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
