import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { getTeacherClassRoster } from '@/lib/teacher/teacher_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { toUserFacingError } from '@/lib/ui/error_messages';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { id: classId } = await params;
    const { searchParams } = new URL(req.url);
    const programmeId = searchParams.get('programmeId');
    const sessionId = searchParams.get('sessionId') || undefined;

    let progId = programmeId;
    if (!progId) {
      const cls = await prisma.schoolClass.findUnique({
        where: { id: classId },
        select: { programmeId: true },
      });
      progId = cls?.programmeId || null;
    }

    if (!progId) {
      return NextResponse.json(
        { error: 'programmeId query parameter is required', code: 'PROGRAMME_ID_REQUIRED' },
        { status: 400 }
      );
    }

    const roster = await getTeacherClassRoster(user.id, classId, progId, sessionId);
    return NextResponse.json({ classId, programmeId: progId, students: roster });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const err = toUserFacingError(error);
    return NextResponse.json({ error: err.message, title: err.title }, { status: 500 });
  }
}
