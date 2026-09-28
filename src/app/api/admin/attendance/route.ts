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
    const period = searchParams.get('period') || undefined;
    let startDate = searchParams.get('startDate') || undefined;
    let endDate = searchParams.get('endDate') || undefined;
    let date = searchParams.get('date') || undefined;

    const programmeId = searchParams.get('programmeId') || undefined;
    const schoolClassId = searchParams.get('schoolClassId') || undefined;

    if (period) {
      const now = new Date();
      endDate = now.toISOString().slice(0, 10);

      if (period === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        startDate = weekAgo.toISOString().slice(0, 10);
      } else if (period === 'month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        startDate = startOfMonth.toISOString().slice(0, 10);
      } else if (period === 'term') {
        const startOfTerm = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        startDate = startOfTerm.toISOString().slice(0, 10);
      } else if (period === 'day') {
        date = date || now.toISOString().slice(0, 10);
        startDate = undefined;
        endDate = undefined;
      }
    } else if (!startDate && !date) {
      date = new Date().toISOString().slice(0, 10);
    }

    const overview = await getAdminAttendanceOverview(actor, {
      date,
      startDate,
      endDate,
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
