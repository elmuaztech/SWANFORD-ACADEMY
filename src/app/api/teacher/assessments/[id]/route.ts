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
    const enrolledStudents = await prisma.studentProgrammeEnrollment.findMany({
      where: {
        programmeId: assessment.programmeId,
        schoolClassId: assessment.schoolClassId,
        academicSessionId: assessment.academicSessionId,
        academicTermId: assessment.academicTermId,
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

    const scoreMap = new Map(assessment.scores.map((s) => [s.studentId, s]));

    const roster = enrolledStudents.map((enr) => {
      const existingScore = scoreMap.get(enr.studentId);
      return {
        student: enr.student,
        score: existingScore
          ? {
              id: existingScore.id,
              rawScore: existingScore.rawScore ? Number(existingScore.rawScore) : null,
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
        createdAt: assessment.createdAt,
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
