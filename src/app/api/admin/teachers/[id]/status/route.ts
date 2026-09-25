import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { updateStaffStatus } from '@/lib/staff/staff_lifecycle_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { TeacherStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { id: teacherId } = await params;
    const body = await request.json();
    const { status, reason } = body;

    if (!status || !Object.values(TeacherStatus).includes(status)) {
      return NextResponse.json({ error: 'Valid staff status is required.' }, { status: 400 });
    }

    const updated = await updateStaffStatus(actor, {
      teacherId,
      status: status as TeacherStatus,
      reason,
    });

    return NextResponse.json({
      success: true,
      teacher: updated,
      message: `Staff status successfully updated to ${status}.`,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to update staff status.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
