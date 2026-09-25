import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { issueStaffDocument } from '@/lib/staff/staff_lifecycle_service';
import { AuthorizationError } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { id: documentId } = await params;
    const document = await issueStaffDocument(actor, documentId);

    return NextResponse.json({
      success: true,
      document,
      message: `Document has been officially issued to the staff member. It is now accessible in their Teacher Portal under My Documents.`,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to issue staff document.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
