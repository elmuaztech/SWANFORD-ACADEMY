import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { listAssessments, createAssessment } from '@/lib/assessment/assessment_service';
import { AuthorizationError, requirePermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { AssessmentStatus, AssessmentType } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const programmeId = searchParams.get('programmeId') || undefined;
    const schoolClassId = searchParams.get('schoolClassId') || undefined;
    const subjectId = searchParams.get('subjectId') || undefined;
    const academicSessionId = searchParams.get('academicSessionId') || undefined;
    const academicTermId = searchParams.get('academicTermId') || undefined;
    const status = (searchParams.get('status') as AssessmentStatus) || undefined;
    const type = (searchParams.get('type') as AssessmentType) || undefined;

    const assessments = await listAssessments(actor, {
      programmeId,
      schoolClassId,
      subjectId,
      academicSessionId,
      academicTermId,
      status,
      type,
    });

    return NextResponse.json(assessments);
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to retrieve assessments.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await requirePermission(actor, PermissionCode.SUBJECT_MANAGE);

    const body = await request.json();
    const assessment = await createAssessment(actor, body);

    return NextResponse.json(assessment, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to create assessment.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
