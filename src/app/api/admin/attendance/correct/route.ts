import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { correctStudentAttendance } from '@/lib/admin/admin_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { AttendanceStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();
    const { studentId, programmeId, schoolClassId, date, status, remarks, reason } = body;

    if (!studentId || !programmeId || !schoolClassId || !date || !status || !reason) {
      return NextResponse.json(
        { error: 'studentId, programmeId, schoolClassId, date, status, and reason are required.' },
        { status: 400 }
      );
    }

    if (!Object.values(AttendanceStatus).includes(status)) {
      return NextResponse.json(
        { error: 'Invalid AttendanceStatus (PRESENT, ABSENT, LATE, EXCUSED).' },
        { status: 400 }
      );
    }

    const updated = await correctStudentAttendance(actor, {
      studentId,
      programmeId,
      schoolClassId,
      date,
      status: status as AttendanceStatus,
      remarks,
      reason,
    });

    return NextResponse.json({ success: true, record: updated });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to correct attendance record.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
