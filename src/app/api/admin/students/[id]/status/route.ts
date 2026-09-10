import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { transitionStudentStatus } from '@/lib/students/student_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { StudentStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();
    const { status, reason } = body;

    if (!status || !Object.values(StudentStatus).includes(status)) {
      return NextResponse.json(
        { error: 'Valid StudentStatus is required (ACTIVE, INACTIVE, WITHDRAWN, GRADUATED, ARCHIVED).' },
        { status: 400 }
      );
    }

    const updated = await transitionStudentStatus(actor, id, status as StudentStatus, reason);
    return NextResponse.json({ success: true, student: updated });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to transition student status.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
