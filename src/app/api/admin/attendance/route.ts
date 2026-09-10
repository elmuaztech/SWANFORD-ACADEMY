import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { getAdminAttendanceOverview } from '@/lib/admin/admin_service';
import { AuthorizationError } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);
    const programmeId = searchParams.get('programmeId') || undefined;
    const schoolClassId = searchParams.get('schoolClassId') || undefined;

    const overview = await getAdminAttendanceOverview(actor, {
      date,
      programmeId,
      schoolClassId,
    });

    return NextResponse.json(overview);
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to retrieve attendance register.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
