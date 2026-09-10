import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { assignTeacherScope } from '@/lib/admin/admin_service';
import { AuthorizationError } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: teacherId } = await params;
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();
    const { programmeId, schoolClassId, subjectId, academicSessionId } = body;

    if (!programmeId || !academicSessionId) {
      return NextResponse.json(
        { error: 'programmeId and academicSessionId are required to assign a teacher scope.' },
        { status: 400 }
      );
    }

    const scope = await assignTeacherScope(actor, {
      teacherId,
      programmeId,
      schoolClassId,
      subjectId,
      academicSessionId,
    });

    return NextResponse.json({ success: true, scope }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to assign teacher scope.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
