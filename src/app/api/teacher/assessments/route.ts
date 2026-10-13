import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { createAssessment } from '@/lib/assessment/assessment_service';
import { prisma } from '@/lib/prisma';
import { AuthorizationError, requirePermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { getTeacherAccessibleScopes, assertTeacherScope } from '@/lib/auth/scopes';
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
    const { schoolClassId, subjectId, programmeId: inputProgrammeId, title, academicTermId } = body;

    if (!schoolClassId) {
      return NextResponse.json(
        {
          error: 'Academic assessments may only be created and scheduled by school administrators. Teachers are authorized to record marks for scheduled assessments.',
          code: 'ADMIN_ONLY_ACTION',
        },
        { status: 403 }
      );
    }

    // Resolve class and programme
    const schoolClass = await prisma.schoolClass.findUnique({
      where: { id: schoolClassId },
      include: { programme: true },
    });

    if (!schoolClass) {
      return NextResponse.json({ error: 'Selected class does not exist' }, { status: 404 });
    }

    const programmeId = inputProgrammeId || schoolClass.programmeId;

    // Verify TeacherScope
    await assertTeacherScope(user, {
      programmeId,
      schoolClassId,
      subjectId: subjectId || undefined,
    });

    // Resolve active session
    let activeSession = await prisma.academicSession.findFirst({
      where: { isCurrent: true },
      select: { id: true, name: true },
    });
    if (!activeSession) {
      activeSession = await prisma.academicSession.findFirst({
        orderBy: { startDate: 'desc' },
        select: { id: true, name: true },
      });
    }
    if (!activeSession) {
      return NextResponse.json({ error: 'No active academic session found' }, { status: 400 });
    }

    // Resolve active term
    let termId = academicTermId;
    if (!termId) {
      let activeTerm = await prisma.academicTerm.findFirst({
        where: { academicSessionId: activeSession.id, isCurrent: true },
        select: { id: true, name: true },
      });
      if (!activeTerm) {
        activeTerm = await prisma.academicTerm.findFirst({
          where: { academicSessionId: activeSession.id },
          orderBy: { startDate: 'desc' },
          select: { id: true, name: true },
        });
      }
      termId = activeTerm?.id;
    }

    if (!termId) {
      return NextResponse.json({ error: 'No academic term available' }, { status: 400 });
    }

    // Check if an assessment already exists for this combination
    const existing = await prisma.assessment.findFirst({
      where: {
        schoolClassId,
        subjectId: subjectId || null,
        academicSessionId: activeSession.id,
        academicTermId: termId,
      },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        assessment: existing,
        message: 'Loaded existing assessment sheet for this class and subject.',
      });
    }

    // Resolve subject name if provided
    let subjectName = '';
    if (subjectId) {
      const sub = await prisma.subject.findUnique({ where: { id: subjectId } });
      if (sub) subjectName = sub.name;
    }

    // Resolve default grading scale for the programme
    let gradingScale = await prisma.gradingScale.findFirst({
      where: { programmeId, isActive: true },
    });
    if (!gradingScale) {
      gradingScale = await prisma.gradingScale.findFirst({
        where: { isActive: true },
      });
    }

    if (!gradingScale) {
      return NextResponse.json({ error: 'No grading scale configured in system' }, { status: 500 });
    }

    const defaultTitle = title?.trim() || (subjectName
      ? `${schoolClass.name} — ${subjectName} Assessment & Exam`
      : `${schoolClass.name} — Class Evaluation & Continuous Assessment`);

    const created = await prisma.assessment.create({
      data: {
        title: defaultTitle,
        type: 'CONTINUOUS_ASSESSMENT',
        programmeId,
        schoolClassId,
        subjectId: subjectId || null,
        academicSessionId: activeSession.id,
        academicTermId: termId,
        gradingScaleId: gradingScale.id,
        maxScore: 100,
        weightPercentage: 100,
        status: 'DRAFT',
        createdById: user.id,
      },
      include: {
        schoolClass: true,
        subject: true,
        programme: true,
      },
    });

    return NextResponse.json({
      success: true,
      assessment: created,
      message: 'Assessment score sheet initialized successfully.',
    }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const err = toUserFacingError(error);
    return NextResponse.json({ error: err.message, title: err.title }, { status: 500 });
  }
}
