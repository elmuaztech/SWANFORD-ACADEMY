import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { updateParentNotificationPreferences } from '@/lib/parent/parent_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { toUserFacingError } from '@/lib/ui/error_messages';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await req.json();
    if (!Array.isArray(body.preferences)) {
      return NextResponse.json(
        { error: 'preferences array is required', code: 'INVALID_PREFERENCES' },
        { status: 400 }
      );
    }

    const result = await updateParentNotificationPreferences(user.id, body.preferences);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const err = toUserFacingError(error);
    return NextResponse.json({ error: err.message, title: err.title }, { status: 500 });
  }
}
