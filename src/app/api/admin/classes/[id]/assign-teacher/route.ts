import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { assignTeacherScope } from '@/lib/admin/admin_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: schoolClassId } = await params;
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const schoolClass = await prisma.schoolClass.findUnique({
      where: { id: schoolClassId },
      include: { programme: true },
    });
    if (!schoolClass) {
      return NextResponse.json({ error: 'Class not found.' }, { status: 404 });
    }

    const body = await request.json();
    const { teacherId, subjectId, isClassTeacher } = body;

    if (!teacherId) {
      return NextResponse.json({ error: 'Teacher is required.' }, { status: 400 });
    }

    // Get current active session
    let academicSessionId = body.academicSessionId;
    if (!academicSessionId) {
      const currentSession = await prisma.academicSession.findFirst({
        where: { isCurrent: true },
      });
      if (currentSession) {
        academicSessionId = currentSession.id;
      } else {
        const latestSession = await prisma.academicSession.findFirst({
          orderBy: { startDate: 'desc' },
        });
        if (latestSession) academicSessionId = latestSession.id;
      }
    }

    if (!academicSessionId) {
      return NextResponse.json(
        { error: 'An active academic session is required to assign teacher scopes.' },
        { status: 400 }
      );
    }

    const scope = await assignTeacherScope(actor, {
      teacherId,
      programmeId: schoolClass.programmeId,
      schoolClassId: schoolClass.id,
      subjectId: subjectId || null,
      academicSessionId,
      isClassTeacher: Boolean(isClassTeacher),
    });

    return NextResponse.json({
      success: true,
      scope,
      message: 'Teacher assigned to class successfully.',
    }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to assign teacher to class.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
