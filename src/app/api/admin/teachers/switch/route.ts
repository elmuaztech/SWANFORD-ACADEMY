import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { switchTeachers } from '@/lib/staff/staff_lifecycle_service';
import { AuthorizationError } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();
    const { teacherAId, classAId, teacherBId, classBId, programmeId, academicSessionId, reason } = body;

    if (!teacherAId || !classAId || !teacherBId || !classBId || !programmeId || !academicSessionId) {
      return NextResponse.json(
        { error: 'teacherAId, classAId, teacherBId, classBId, programmeId, and academicSessionId are required.' },
        { status: 400 }
      );
    }

    const result = await switchTeachers(actor, {
      teacherAId,
      classAId,
      teacherBId,
      classBId,
      programmeId,
      academicSessionId,
      reason,
    });

    return NextResponse.json({
      success: true,
      result,
      message: 'Atomic teacher class switch executed successfully.',
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to switch teachers.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
