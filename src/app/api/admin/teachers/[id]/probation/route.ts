import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import {
  saveProbationAssessment,
  getTeacherProbationRecords,
} from '@/lib/staff/staff_lifecycle_service';
import { AuthorizationError } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { id: teacherId } = await params;
    const records = await getTeacherProbationRecords(actor, teacherId);

    return NextResponse.json({ success: true, records });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to load probation records.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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

    const record = await saveProbationAssessment(actor, {
      teacherId,
      monthNumber: Number(body.monthNumber),
      position: body.position || 'Classroom Teacher',
      department: body.department,
      dateOfEmployment: new Date(body.dateOfEmployment || Date.now()),
      probationStartDate: new Date(body.probationStartDate || Date.now()),
      probationEndDate: new Date(body.probationEndDate || Date.now()),
      ratings: body.ratings,
      comments: body.comments,
      strengths: body.strengths,
      areasForImprovement: body.areasForImprovement,
      targets: body.targets,
      recommendation: body.recommendation,
      isFinal: !!body.isFinal,
      finalRecommendation: body.finalRecommendation,
      assessorSignature: body.assessorSignature,
      staffSignature: body.staffSignature,
    });

    return NextResponse.json({
      success: true,
      record,
      message: `Month ${body.monthNumber} probation assessment recorded successfully.`,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to record probation assessment.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
