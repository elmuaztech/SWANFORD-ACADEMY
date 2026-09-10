import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { updateUserAccountStatus } from '@/lib/admin/admin_service';
import { AuthorizationError } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (!['ACTIVATE', 'DEACTIVATE', 'UNLOCK'].includes(action)) {
      return NextResponse.json(
        { error: 'Valid action is required (ACTIVATE, DEACTIVATE, UNLOCK).' },
        { status: 400 }
      );
    }

    const updated = await updateUserAccountStatus(actor, id, action);
    return NextResponse.json({
      success: true,
      message: `User account status updated to ${updated.status}.`,
      user: updated,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to update user account status.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
