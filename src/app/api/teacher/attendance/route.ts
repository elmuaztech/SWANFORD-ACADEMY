import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import {
  getClassDailyAttendance,
  recordDailyAttendance,
} from '@/lib/attendance/attendance_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { toUserFacingError } from '@/lib/ui/error_messages';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const programmeId = searchParams.get('programmeId');
    const schoolClassId = searchParams.get('schoolClassId');
    const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);
    const academicSessionId = searchParams.get('academicSessionId') || undefined;

    if (!programmeId || !schoolClassId) {
      return NextResponse.json(
        { error: 'programmeId and schoolClassId query parameters are required', code: 'PARAMS_REQUIRED' },
        { status: 400 }
      );
    }

    const attendance = await getClassDailyAttendance(user, {
      programmeId,
      schoolClassId,
      date,
      academicSessionId,
    });

    return NextResponse.json(attendance);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const err = toUserFacingError(error);
    return NextResponse.json({ error: err.message, title: err.title }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await req.json();
    const result = await recordDailyAttendance(user, body);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const err = toUserFacingError(error);
    return NextResponse.json({ error: err.message, title: err.title }, { status: 500 });
  }
}
