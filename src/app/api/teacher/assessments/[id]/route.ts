import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { prisma } from '@/lib/prisma';
import { AuthorizationError, requirePermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { assertTeacherScope } from '@/lib/auth/scopes';
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

    await requirePermission(user, PermissionCode.ASSESSMENT_VIEW);

    const { id: assessmentId } = await params;

    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        programme: { select: { name: true, code: true } },
        schoolClass: { select: { name: true, arm: true } },
        subject: { select: { name: true, code: true } },
        gradingScale: {
          include: {
            bands: { orderBy: { minScore: 'desc' } },
          },
        },
        academicSession: { select: { name: true } },
        academicTerm: { select: { name: true } },
        scores: {
          include: {
            student: {
              select: {
                id: true,
                admissionNumber: true,
                firstName: true,
                lastName: true,
                otherNames: true,
                gender: true,
              },
            },
          },
          orderBy: [
            { student: { lastName: 'asc' } },
            { student: { firstName: 'asc' } },
          ],
        },
      },
    });

    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // Assert TeacherScope
    await assertTeacherScope(user, {
      programmeId: assessment.programmeId,
      schoolClassId: assessment.schoolClassId,
      subjectId: assessment.subjectId || undefined,
      academicSessionId: assessment.academicSessionId,
    });

    // Also load any active enrolled students in this class who don't have a score record yet
    let enrolledStudents = await prisma.studentProgrammeEnrollment.findMany({
      where: {
        programmeId: assessment.programmeId,
        schoolClassId: assessment.schoolClassId,
        ...(assessment.academicSessionId ? { academicSessionId: assessment.academicSessionId } : {}),
        enrollmentStatus: 'ACTIVE',
      },
      include: {
        student: {
          select: {
            id: true,
            admissionNumber: true,
            firstName: true,
            lastName: true,
            otherNames: true,
            gender: true,
          },
        },
      },
      orderBy: [
        { student: { lastName: 'asc' } },
        { student: { firstName: 'asc' } },
      ],
    });

    if (enrolledStudents.length === 0) {
      enrolledStudents = await prisma.studentProgrammeEnrollment.findMany({
        where: {
          schoolClassId: assessment.schoolClassId,
          enrollmentStatus: 'ACTIVE',
        },
        include: {
          student: {
            select: {
              id: true,
              admissionNumber: true,
              firstName: true,
              lastName: true,
              otherNames: true,
              gender: true,
            },
          },
        },
        orderBy: [
          { student: { lastName: 'asc' } },
          { student: { firstName: 'asc' } },
        ],
      });
    }

    const scoreMap = new Map(assessment.scores.map((s) => [s.studentId, s]));

    const roster = enrolledStudents.map((enr) => {
      const existingScore = scoreMap.get(enr.studentId);
      return {
        student: enr.student,
        score: existingScore
          ? {
              id: existingScore.id,
              rawScore: existingScore.rawScore ? Number(existingScore.rawScore) : null,
              componentScores: (existingScore.componentScoresJson as Record<string, number>) || null,
              grade: existingScore.grade,
              points: existingScore.points ? Number(existingScore.points) : null,
              remark: existingScore.remark,
              isPass: existingScore.isPass,
              scoreStatus: existingScore.scoreStatus,
              teacherNotes: existingScore.teacherNotes,
            }
          : null,
      };
    });

    // Resolve assessment components structure (e.g. CA 30 + Exam 70, or dynamic structure config)
    let components = [
      { name: "Continuous Assessment", shortCode: "CA", maxScore: 30, weightPercentage: 30 },
      { name: "Term Examination", shortCode: "EXAM", maxScore: 70, weightPercentage: 70 },
    ];

    const customConfig = await prisma.assessmentStructureConfig.findFirst({
      where: {
        programmeId: assessment.programmeId,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (customConfig && customConfig.componentsJson && Array.isArray(customConfig.componentsJson) && customConfig.componentsJson.length > 0) {
      components = customConfig.componentsJson as any;
    }

    const latestReview = await prisma.assessmentReviewLog.findFirst({
      where: { assessmentId },
      orderBy: { createdAt: 'desc' },
      include: {
        actorUser: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    return NextResponse.json({
      assessment: {
        id: assessment.id,
        title: assessment.title,
        type: assessment.type,
        status: assessment.status,
        maxScore: Number(assessment.maxScore),
        weightPercentage: Number(assessment.weightPercentage),
        programme: assessment.programme,
        schoolClass: assessment.schoolClass,
        subject: assessment.subject,
        gradingScale: assessment.gradingScale,
        session: assessment.academicSession,
        term: assessment.academicTerm,
        components,
        createdAt: assessment.createdAt,
        latestReview: latestReview
          ? {
              comment: latestReview.comment,
              action: latestReview.action,
              reviewerName: latestReview.actorUser
                ? `${latestReview.actorUser.firstName} ${latestReview.actorUser.lastName}`.trim()
                : "Administrator",
              createdAt: latestReview.createdAt,
            }
          : null,
      },
      roster,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const err = toUserFacingError(error);
    return NextResponse.json({ error: err.message, title: err.title }, { status: 500 });
  }
}
