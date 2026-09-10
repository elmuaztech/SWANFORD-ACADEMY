import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { reviewProgrammeSelection, ReviewSelectionSchema } from '@/lib/admissions/application_service';
import { AuthorizationError } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params; // ensure params resolved
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();
    const { selectionId, decision, decisionNotes } = body;

    if (!selectionId) {
      return NextResponse.json({ error: 'selectionId is required.' }, { status: 400 });
    }

    const validated = ReviewSelectionSchema.parse({ decision, decisionNotes });
    const result = await reviewProgrammeSelection(actor, selectionId, validated);

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to record review decision.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
