import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { createAssessment } from '@/lib/assessment/assessment_service';
import { prisma } from '@/lib/prisma';
import { AuthorizationError, requirePermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { getTeacherAccessibleScopes } from '@/lib/auth/scopes';
import { toUserFacingError } from '@/lib/ui/error_messages';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    await requirePermission(user, PermissionCode.ASSESSMENT_VIEW);

    const scopes = await getTeacherAccessibleScopes(user);
    if (scopes.length === 0) {
      return NextResponse.json({ assessments: [] });
    }

    const { searchParams } = new URL(req.url);
    const programmeId = searchParams.get('programmeId');
    const schoolClassId = searchParams.get('schoolClassId');
    const status = searchParams.get('status');

    // Build scoped query
    const programmeIds = Array.from(new Set(scopes.map((s) => s.programmeId)));
    const classIds = scopes
      .map((s) => s.schoolClassId)
      .filter((id): id is string => id !== null);

    const where: Record<string, unknown> = {
      programmeId: programmeId || { in: programmeIds },
    };

    if (schoolClassId) {
      where.schoolClassId = schoolClassId;
    } else if (classIds.length > 0 && !scopes.some((s) => s.schoolClassId === null)) {
      where.schoolClassId = { in: classIds };
    }

    if (status) {
      where.status = status;
    }

    const assessments = await prisma.assessment.findMany({
      where,
      include: {
        programme: { select: { name: true, code: true } },
        schoolClass: { select: { name: true, arm: true } },
        subject: { select: { name: true, code: true } },
        academicSession: { select: { name: true } },
        academicTerm: { select: { name: true } },
        _count: { select: { scores: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ assessments });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const err = toUserFacingError(error);
    return NextResponse.json({ error: err.message, title: err.title }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await req.json();
    const assessment = await createAssessment(user, body);

    return NextResponse.json(assessment, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const err = toUserFacingError(error);
    return NextResponse.json({ error: err.message, title: err.title }, { status: 500 });
  }
}
