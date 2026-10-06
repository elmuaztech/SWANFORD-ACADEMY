import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { getClassTermAttendanceRegister } from '@/lib/attendance/attendance_service';
import { AuthorizationError } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const programmeId = searchParams.get('programmeId') || undefined;
    const schoolClassId = searchParams.get('schoolClassId') || undefined;
    const academicTermId = searchParams.get('academicTermId') || undefined;
    const academicSessionId = searchParams.get('academicSessionId') || undefined;

    const result = await getClassTermAttendanceRegister(actor, {
      programmeId,
      schoolClassId,
      academicTermId,
      academicSessionId,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to retrieve term attendance register.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
