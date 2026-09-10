import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { getParentChildResults } from '@/lib/parent/parent_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { toUserFacingError } from '@/lib/ui/error_messages';

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

    const { id: studentId } = await params;
    const { searchParams } = new URL(req.url);
    const academicTermId = searchParams.get('academicTermId') || undefined;
    const programmeId = searchParams.get('programmeId') || undefined;

    const results = await getParentChildResults(user.id, studentId, {
      academicTermId,
      programmeId,
    });

    return NextResponse.json(results);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const err = toUserFacingError(error);
    return NextResponse.json({ error: err.message, title: err.title }, { status: 500 });
  }
}
