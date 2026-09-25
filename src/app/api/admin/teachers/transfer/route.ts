import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { transferTeacherClass } from '@/lib/staff/staff_lifecycle_service';
import { AuthorizationError } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();
    const { teacherId, fromClassId, toClassId, programmeId, academicSessionId, subjectId, reason } = body;

    if (!teacherId || !fromClassId || !toClassId || !programmeId || !academicSessionId) {
      return NextResponse.json(
        { error: 'teacherId, fromClassId, toClassId, programmeId, and academicSessionId are required.' },
        { status: 400 }
      );
    }

    const scope = await transferTeacherClass(actor, {
      teacherId,
      fromClassId,
      toClassId,
      programmeId,
      academicSessionId,
      subjectId,
      reason,
    });

    return NextResponse.json({
      success: true,
      scope,
      message: 'Teacher class transfer executed successfully.',
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to transfer teacher.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
