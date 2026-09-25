import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { reviewAssessment } from '@/lib/assessment/assessment_service';
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
    const { action, comment } = body;

    if (!action || (action !== 'APPROVE' && action !== 'RETURN')) {
      return NextResponse.json(
        { error: "Review action must be either 'APPROVE' or 'RETURN'." },
        { status: 400 }
      );
    }

    const reviewed = await reviewAssessment(actor, assessmentId, action, comment);
    return NextResponse.json({
      success: true,
      message: action === 'APPROVE'
        ? 'Assessment approved successfully.'
        : 'Assessment returned for correction with teacher instructions.',
      assessment: reviewed,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to review assessment.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
