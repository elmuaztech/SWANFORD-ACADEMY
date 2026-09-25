import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { reassignTeacherClass } from '@/lib/staff/staff_lifecycle_service';
import { AuthorizationError } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();
    const { fromTeacherId, toTeacherId, schoolClassId, academicSessionId, programmeId, subjectId, reason } = body;

    if (!fromTeacherId || !toTeacherId || !schoolClassId || !academicSessionId || !programmeId) {
      return NextResponse.json(
        { error: 'fromTeacherId, toTeacherId, schoolClassId, academicSessionId, and programmeId are required.' },
        { status: 400 }
      );
    }

    const scope = await reassignTeacherClass(actor, {
      fromTeacherId,
      toTeacherId,
      schoolClassId,
      academicSessionId,
      programmeId,
      subjectId,
      reason,
    });

    return NextResponse.json({
      success: true,
      scope,
      message: 'Teacher reassignment completed successfully with complete audit trail.',
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to reassign teacher.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
