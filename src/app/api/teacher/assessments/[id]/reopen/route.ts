import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { reopenAssessment } from '@/lib/assessment/assessment_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { toUserFacingError } from '@/lib/ui/error_messages';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { id: assessmentId } = await params;
    const body = await req.json();

    if (!body.justification || typeof body.justification !== 'string') {
      return NextResponse.json(
        { error: 'A justification string is required to reopen an assessment.', code: 'JUSTIFICATION_REQUIRED' },
        { status: 400 }
      );
    }

    const result = await reopenAssessment(user, assessmentId, body.justification);

    return NextResponse.json({ success: true, assessment: result });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const err = toUserFacingError(error);
    return NextResponse.json({ error: err.message, title: err.title }, { status: 500 });
  }
}
