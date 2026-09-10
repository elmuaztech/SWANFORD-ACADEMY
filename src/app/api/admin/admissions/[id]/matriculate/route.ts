import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { matriculateApplication } from '@/lib/admissions/matriculation_service';
import { AuthorizationError } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { programmeClassAssignments } = body;

    const result = await matriculateApplication(actor, {
      applicationId,
      programmeClassAssignments,
    });

    return NextResponse.json({
      success: true,
      studentId: result.student.id,
      admissionNumber: result.student.admissionNumber,
      message: 'Student matriculated and enrolled successfully.',
      result,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to matriculate application.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
