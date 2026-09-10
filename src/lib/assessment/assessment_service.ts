import {
  AssessmentStatus,
  AssessmentType,
  AssessmentScoreStatus,
  EnrollmentStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { SafeUser } from '@/lib/auth/service';
import { AuthorizationError, requirePermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { assertTeacherScope } from '@/lib/auth/scopes';
import { resolveGrade, getGradingScale } from '@/lib/academic/grading_service';
import { enqueueNotification } from '@/lib/notifications/outbox';
import { renderResultPublishedEmail } from '@/lib/notifications/templates/catalog';

export interface CreateAssessmentInput {
  title: string;
  type: AssessmentType;
  programmeId: string;
  schoolClassId: string;
  subjectId?: string | null;
  academicSessionId?: string;
  academicTermId?: string;
  gradingScaleId: string;
  maxScore: number;
  weightPercentage?: number;
}

export interface ScoreEntryItem {
  studentId: string;
  rawScore?: number | null;
  scoreStatus?: AssessmentScoreStatus;
  teacherNotes?: string | null;
}

export interface UpdateAssessmentScoresInput {
  assessmentId: string;
  scores: ScoreEntryItem[];
}

/**
 * Swanford Academy — Authoritative Academic Assessment Service
 * Master Specification Reference: Sections 4, 5, 6, 7, 8, 13
 */

/**
 * Creates a new assessment in DRAFT status.
 */
export async function createAssessment(
  actor: SafeUser | string,
  input: CreateAssessmentInput
) {
  const actorUserId = typeof actor === 'string' ? actor : actor.id;
  await requirePermission(actorUserId, PermissionCode.ASSESSMENT_ENTER);

  if (!input.title || input.title.trim().length === 0) {
    throw new AuthorizationError('Assessment title is required.', 400, 'TITLE_REQUIRED');
  }

  if (input.maxScore <= 0) {
    throw new AuthorizationError('Max score must be greater than zero.', 400, 'INVALID_MAX_SCORE');
  }

  const weight = input.weightPercentage !== undefined ? input.weightPercentage : 100;
  if (weight <= 0 || weight > 100) {
    throw new AuthorizationError('Weight percentage must be between 1 and 100.', 400, 'INVALID_WEIGHT');
  }

  // Resolve active session
  let sessionId = input.academicSessionId;
  if (!sessionId) {
    const activeSession = await prisma.academicSession.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });
    if (!activeSession) {
      throw new AuthorizationError('No active academic session found.', 400, 'NO_ACTIVE_SESSION');
    }
    sessionId = activeSession.id;
  }

  // Resolve active term
  let termId = input.academicTermId;
  if (!termId) {
    const activeTerm = await prisma.academicTerm.findFirst({
      where: { academicSessionId: sessionId, isCurrent: true },
      select: { id: true },
    });
    if (!activeTerm) {
      throw new AuthorizationError('No active academic term found for this session.', 400, 'NO_ACTIVE_TERM');
    }
    termId = activeTerm.id;
  }

  // Verify term belongs to session
  const term = await prisma.academicTerm.findUnique({
    where: { id: termId },
  });
  if (!term || term.academicSessionId !== sessionId) {
    throw new AuthorizationError(
      'Academic term does not belong to the requested academic session.',
      400,
      'TERM_SESSION_MISMATCH'
    );
  }

  // Assert TeacherScope
  await assertTeacherScope(actorUserId, {
    programmeId: input.programmeId,
    schoolClassId: input.schoolClassId,
    subjectId: input.subjectId || undefined,
    academicSessionId: sessionId,
  });

  // Verify grading scale exists
  await getGradingScale(input.gradingScaleId);

  // Create assessment inside transaction with audit
  const assessment = await prisma.$transaction(async (tx) => {
    const created = await tx.assessment.create({
      data: {
        title: input.title.trim(),
        type: input.type,
        programmeId: input.programmeId,
        schoolClassId: input.schoolClassId,
        subjectId: input.subjectId || null,
        academicSessionId: sessionId,
        academicTermId: termId,
        gradingScaleId: input.gradingScaleId,
        maxScore: new Prisma.Decimal(input.maxScore),
        weightPercentage: new Prisma.Decimal(weight),
        status: AssessmentStatus.DRAFT,
        createdById: actorUserId,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'ASSESSMENT_CREATED',
        entityType: 'Assessment',
        entityId: created.id,
        newValues: {
          title: created.title,
          type: created.type,
          programmeId: created.programmeId,
          schoolClassId: created.schoolClassId,
          subjectId: created.subjectId,
          academicSessionId: sessionId,
          academicTermId: termId,
          maxScore: input.maxScore,
        },
      },
    });

    return created;
  });

  return assessment;
}

/**
 * Updates score records for an assessment.
 * Enforces:
 * 1. Must be in DRAFT status. Teacher cannot edit SUBMITTED or FINALIZED assessments.
 * 2. Strict score bounds [0, maxScore] when status is SCORED.
 * 3. Grading resolution using authoritative grading scale.
 */
export async function updateAssessmentScores(
  actor: SafeUser | string,
  input: UpdateAssessmentScoresInput
) {
  const actorUserId = typeof actor === 'string' ? actor : actor.id;
  await requirePermission(actorUserId, PermissionCode.ASSESSMENT_ENTER);

  const assessment = await prisma.assessment.findUnique({
    where: { id: input.assessmentId },
    include: {
      gradingScale: {
        include: { bands: true },
      },
    },
  });

  if (!assessment) {
    throw new AuthorizationError('Assessment not found.', 404, 'ASSESSMENT_NOT_FOUND');
  }

  // Mandatory integrity check: Teacher cannot edit submitted or finalized assessments
  if (assessment.status !== AssessmentStatus.DRAFT) {
    throw new AuthorizationError(
      `Cannot edit scores: Assessment is in '${assessment.status}' status. Only DRAFT assessments may be modified.`,
      400,
      'ASSESSMENT_NOT_EDITABLE'
    );
  }

  // Teacher scope check
  await assertTeacherScope(actorUserId, {
    programmeId: assessment.programmeId,
    schoolClassId: assessment.schoolClassId,
    subjectId: assessment.subjectId || undefined,
    academicSessionId: assessment.academicSessionId,
  });

  const maxScoreNum = Number(assessment.maxScore);
  const scaleMaxScore = Number(assessment.gradingScale.maxScore);

  // Validate student enrollment
  const studentIds = input.scores.map((s) => s.studentId);
  const activeEnrollments = await prisma.studentProgrammeEnrollment.findMany({
    where: {
      studentId: { in: studentIds },
      programmeId: assessment.programmeId,
      schoolClassId: assessment.schoolClassId,
      academicSessionId: assessment.academicSessionId,
      academicTermId: assessment.academicTermId,
      enrollmentStatus: EnrollmentStatus.ACTIVE,
    },
    select: { studentId: true },
  });

  const enrolledSet = new Set(activeEnrollments.map((e) => e.studentId));

  // Process and validate each score item
  const validatedScores: Array<{
    studentId: string;
    rawScore: Prisma.Decimal | null;
    grade: string | null;
    points: Prisma.Decimal | null;
    remark: string | null;
    isPass: boolean | null;
    scoreStatus: AssessmentScoreStatus;
    teacherNotes: string | null;
  }> = [];

  for (const item of input.scores) {
    if (!enrolledSet.has(item.studentId)) {
      throw new AuthorizationError(
        `Student ${item.studentId} is not actively enrolled in this class and programme.`,
        400,
        'STUDENT_NOT_ENROLLED'
      );
    }

    const scoreStatus = item.scoreStatus || AssessmentScoreStatus.SCORED;

    if (scoreStatus === AssessmentScoreStatus.ABSENT || scoreStatus === AssessmentScoreStatus.EXEMPT) {
      validatedScores.push({
        studentId: item.studentId,
        rawScore: null,
        grade: null,
        points: null,
        remark: null,
        isPass: null,
        scoreStatus,
        teacherNotes: item.teacherNotes || null,
      });
    } else {
      // SCORED: Must validate rawScore
      if (item.rawScore === undefined || item.rawScore === null || isNaN(item.rawScore)) {
        throw new AuthorizationError(
          `Score is required for student ${item.studentId} when status is SCORED.`,
          400,
          'SCORE_REQUIRED'
        );
      }

      if (item.rawScore < 0 || item.rawScore > maxScoreNum) {
        throw new AuthorizationError(
          `Score (${item.rawScore}) is outside the valid range [0, ${maxScoreNum}].`,
          400,
          'SCORE_OUT_OF_RANGE'
        );
      }

      // Normalize score to grading scale's max score
      const normalizedScore = (item.rawScore / maxScoreNum) * scaleMaxScore;
      const resolved = await resolveGrade(assessment.gradingScaleId, normalizedScore);

      validatedScores.push({
        studentId: item.studentId,
        rawScore: new Prisma.Decimal(item.rawScore),
        grade: resolved.grade,
        points: resolved.points !== undefined ? new Prisma.Decimal(resolved.points) : null,
        remark: resolved.remark,
        isPass: resolved.isPass,
        scoreStatus: AssessmentScoreStatus.SCORED,
        teacherNotes: item.teacherNotes || null,
      });
    }
  }

  // Save transactionally
  await prisma.$transaction(async (tx) => {
    for (const s of validatedScores) {
      await tx.assessmentScore.upsert({
        where: {
          assessmentId_studentId: {
            assessmentId: assessment.id,
            studentId: s.studentId,
          },
        },
        create: {
          assessmentId: assessment.id,
          studentId: s.studentId,
          rawScore: s.rawScore,
          grade: s.grade,
          points: s.points,
          remark: s.remark,
          isPass: s.isPass,
          scoreStatus: s.scoreStatus,
          teacherNotes: s.teacherNotes,
        },
        update: {
          rawScore: s.rawScore,
          grade: s.grade,
          points: s.points,
          remark: s.remark,
          isPass: s.isPass,
          scoreStatus: s.scoreStatus,
          teacherNotes: s.teacherNotes,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'ASSESSMENT_SCORES_UPDATED',
        entityType: 'Assessment',
        entityId: assessment.id,
        newValues: {
          assessmentId: assessment.id,
          updatedCount: validatedScores.length,
        },
      },
    });
  });

  return {
    success: true,
    assessmentId: assessment.id,
    updatedCount: validatedScores.length,
  };
}

/**
 * Submits an assessment for administrative review and publication.
 * Lifecycle: DRAFT -> SUBMITTED.
 */
export async function submitAssessment(
  actor: SafeUser | string,
  assessmentId: string
) {
  const actorUserId = typeof actor === 'string' ? actor : actor.id;
  await requirePermission(actorUserId, PermissionCode.ASSESSMENT_ENTER);

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: {
      scores: true,
    },
  });

  if (!assessment) {
    throw new AuthorizationError('Assessment not found.', 404, 'ASSESSMENT_NOT_FOUND');
  }

  if (assessment.status !== AssessmentStatus.DRAFT) {
    throw new AuthorizationError(
      `Cannot submit assessment in '${assessment.status}' status. Only DRAFT assessments may be submitted.`,
      400,
      'INVALID_STATUS_TRANSITION'
    );
  }

  // Teacher scope check
  await assertTeacherScope(actorUserId, {
    programmeId: assessment.programmeId,
    schoolClassId: assessment.schoolClassId,
    subjectId: assessment.subjectId || undefined,
    academicSessionId: assessment.academicSessionId,
  });

  if (assessment.scores.length === 0) {
    throw new AuthorizationError(
      'Cannot submit assessment with no entered scores.',
      400,
      'EMPTY_ASSESSMENT_SCORES'
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.assessment.update({
      where: { id: assessmentId },
      data: { status: AssessmentStatus.SUBMITTED },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'ASSESSMENT_SUBMITTED',
        entityType: 'Assessment',
        entityId: assessmentId,
        newValues: {
          previousStatus: 'DRAFT',
          newStatus: 'SUBMITTED',
          scoresCount: assessment.scores.length,
        },
      },
    });

    return res;
  });

  return updated;
}

/**
 * Finalizes and publishes an assessment.
 * Restricted to administrative roles with RESULT_PUBLISH permission.
 * Lifecycle: SUBMITTED -> FINALIZED.
 */
export async function finalizeAssessment(
  actor: SafeUser | string,
  assessmentId: string
) {
  const actorUserId = typeof actor === 'string' ? actor : actor.id;
  await requirePermission(actorUserId, PermissionCode.RESULT_PUBLISH);

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: {
      scores: {
        include: {
          student: {
            include: {
              guardianLinks: {
                where: { status: 'ACTIVE' },
                include: { guardian: { include: { user: true } } },
              },
            },
          },
        },
      },
      subject: true,
      programme: true,
    },
  });

  if (!assessment) {
    throw new AuthorizationError('Assessment not found.', 404, 'ASSESSMENT_NOT_FOUND');
  }

  if (assessment.status !== AssessmentStatus.SUBMITTED) {
    throw new AuthorizationError(
      `Cannot finalize assessment: Current status is '${assessment.status}'. Only SUBMITTED assessments may be finalized.`,
      400,
      'INVALID_STATUS_TRANSITION'
    );
  }

  const finalized = await prisma.$transaction(async (tx) => {
    const updated = await tx.assessment.update({
      where: { id: assessmentId },
      data: { status: AssessmentStatus.FINALIZED },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'ASSESSMENT_FINALIZED',
        entityType: 'Assessment',
        entityId: assessmentId,
        newValues: {
          previousStatus: 'SUBMITTED',
          newStatus: 'FINALIZED',
          finalizedBy: actorUserId,
        },
      },
    });

    return updated;
  });

  // Stage 10 Notification Outbox enqueue (Async safe)
  for (const score of assessment.scores) {
    for (const link of score.student.guardianLinks) {
      if (link.guardian.email) {
        const studentName = `${score.student.firstName} ${score.student.lastName}`;
        const email = renderResultPublishedEmail({
          recipientName: `${link.guardian.firstName} ${link.guardian.lastName}`,
          studentName,
          subjectName: assessment.subject?.name || assessment.title,
          grade: score.grade || 'N/A',
          resultsUrl: `${process.env.APP_URL || 'https://portal.swanford.edu.ng'}/parent/children/${score.studentId}/results`,
        });

        await enqueueNotification({
          idempotencyKey: `RESULT-PUB-${assessment.id}-${score.studentId}-${link.guardianId}`,
          recipientUserId: link.guardian.userId || undefined,
          recipientEmail: link.guardian.email,
          category: 'ACADEMIC',
          templateName: 'RESULT_PUBLISHED',
          subject: email.subject,
          bodyText: email.text,
          htmlBody: email.html,
          metadata: {
            assessmentId: assessment.id,
            studentId: score.studentId,
            score: score.rawScore ? Number(score.rawScore) : null,
          },
        }).catch((err) => {
          console.error(`Failed to enqueue result notification for student ${score.studentId}:`, err);
        });
      }
    }
  }

  return finalized;
}

/**
 * Reopens a FINALIZED assessment back to DRAFT.
 * Requires RESULT_PUBLISH permission and mandatory justification text.
 * Lifecycle: FINALIZED -> DRAFT.
 */
export async function reopenAssessment(
  actor: SafeUser | string,
  assessmentId: string,
  justification: string
) {
  const actorUserId = typeof actor === 'string' ? actor : actor.id;
  await requirePermission(actorUserId, PermissionCode.RESULT_PUBLISH);

  if (!justification || justification.trim().length < 5) {
    throw new AuthorizationError(
      'A mandatory explanation/justification is required to reopen a finalized assessment.',
      400,
      'JUSTIFICATION_REQUIRED'
    );
  }

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
  });

  if (!assessment) {
    throw new AuthorizationError('Assessment not found.', 404, 'ASSESSMENT_NOT_FOUND');
  }

  if (assessment.status !== AssessmentStatus.FINALIZED) {
    throw new AuthorizationError(
      `Cannot reopen assessment: Current status is '${assessment.status}'. Only FINALIZED assessments can be reopened.`,
      400,
      'INVALID_STATUS_TRANSITION'
    );
  }

  const reopened = await prisma.$transaction(async (tx) => {
    const updated = await tx.assessment.update({
      where: { id: assessmentId },
      data: { status: AssessmentStatus.DRAFT },
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'ASSESSMENT_REOPENED',
        entityType: 'Assessment',
        entityId: assessmentId,
        newValues: {
          previousStatus: 'FINALIZED',
          newStatus: 'DRAFT',
          justification: justification.trim(),
          reopenedBy: actorUserId,
        },
      },
    });

    return updated;
  });

  return reopened;
}

/**
 * Deletes an assessment only if it is in DRAFT status and has never been finalized.
 */
export async function deleteDraftAssessment(
  actor: SafeUser | string,
  assessmentId: string
) {
  const actorUserId = typeof actor === 'string' ? actor : actor.id;
  await requirePermission(actorUserId, PermissionCode.ASSESSMENT_ENTER);

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
  });

  if (!assessment) {
    throw new AuthorizationError('Assessment not found.', 404, 'ASSESSMENT_NOT_FOUND');
  }

  if (assessment.status !== AssessmentStatus.DRAFT) {
    throw new AuthorizationError(
      'Cannot delete assessment: Only DRAFT assessments that have not been submitted may be deleted.',
      400,
      'ASSESSMENT_NOT_DELETABLE'
    );
  }

  // Teacher scope check
  await assertTeacherScope(actorUserId, {
    programmeId: assessment.programmeId,
    schoolClassId: assessment.schoolClassId,
    subjectId: assessment.subjectId || undefined,
    academicSessionId: assessment.academicSessionId,
  });

  await prisma.$transaction(async (tx) => {
    await tx.assessmentScore.deleteMany({ where: { assessmentId } });
    await tx.assessment.delete({ where: { id: assessmentId } });

    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'ASSESSMENT_DELETED',
        entityType: 'Assessment',
        entityId: assessmentId,
        newValues: {
          title: assessment.title,
          deletedBy: actorUserId,
        },
      },
    });
  });

  return { success: true };
}

/**
 * Calculates finalized subject results for a student in a specific term.
 * Section 7: Uses ONLY FINALIZED assessments, weighting each component proportionally.
 */
export async function calculateStudentTermResults(params: {
  studentId: string;
  programmeId: string;
  academicTermId: string;
  academicSessionId?: string;
}) {
  // Query all FINALIZED assessments for this student, term, and programme
  const scores = await prisma.assessmentScore.findMany({
    where: {
      studentId: params.studentId,
      assessment: {
        programmeId: params.programmeId,
        academicTermId: params.academicTermId,
        status: AssessmentStatus.FINALIZED,
        ...(params.academicSessionId ? { academicSessionId: params.academicSessionId } : {}),
      },
    },
    include: {
      assessment: {
        include: {
          subject: true,
          gradingScale: true,
        },
      },
    },
  });

  // Group by subject (or general if subject is null)
  const subjectMap = new Map<
    string,
    {
      subjectId: string | null;
      subjectName: string;
      assessments: Array<{
        assessmentId: string;
        title: string;
        type: AssessmentType;
        weightPercentage: number;
        maxScore: number;
        rawScore: number | null;
        scoreStatus: AssessmentScoreStatus;
        grade: string | null;
        remark: string | null;
      }>;
      gradingScaleId: string;
    }
  >();

  for (const s of scores) {
    const key = s.assessment.subjectId || 'GENERAL';
    const existing = subjectMap.get(key) || {
      subjectId: s.assessment.subjectId,
      subjectName: s.assessment.subject?.name || s.assessment.title,
      assessments: [],
      gradingScaleId: s.assessment.gradingScaleId,
    };

    existing.assessments.push({
      assessmentId: s.assessment.id,
      title: s.assessment.title,
      type: s.assessment.type,
      weightPercentage: Number(s.assessment.weightPercentage),
      maxScore: Number(s.assessment.maxScore),
      rawScore: s.rawScore ? Number(s.rawScore) : null,
      scoreStatus: s.scoreStatus,
      grade: s.grade,
      remark: s.remark,
    });

    subjectMap.set(key, existing);
  }

  const results = [];

  for (const [, item] of subjectMap) {
    let totalWeightedScore = 0;
    let totalWeight = 0;

    for (const a of item.assessments) {
      if (a.scoreStatus === AssessmentScoreStatus.SCORED && a.rawScore !== null) {
        const percentageScore = (a.rawScore / a.maxScore) * 100;
        totalWeightedScore += (percentageScore * a.weightPercentage) / 100;
        totalWeight += a.weightPercentage;
      }
    }

    const finalPercentage = totalWeight > 0 ? (totalWeightedScore / totalWeight) * 100 : 0;
    const roundedScore = Math.round(finalPercentage * 100) / 100;

    let overallGrade: string | null = null;
    let overallRemark: string | null = null;
    let isPass: boolean | null = null;

    try {
      const resolved = await resolveGrade(item.gradingScaleId, roundedScore);
      overallGrade = resolved.grade;
      overallRemark = resolved.remark;
      isPass = resolved.isPass;
    } catch {
      // If score is 0 or scale out of range
      overallGrade = 'N/A';
    }

    results.push({
      subjectId: item.subjectId,
      subjectName: item.subjectName,
      totalWeightedScore: roundedScore,
      grade: overallGrade,
      remark: overallRemark,
      isPass,
      components: item.assessments,
    });
  }

  return results;
}

export interface ListAssessmentsFilter {
  programmeId?: string;
  schoolClassId?: string;
  subjectId?: string;
  academicSessionId?: string;
  academicTermId?: string;
  status?: AssessmentStatus;
  type?: AssessmentType;
}

export async function listAssessments(
  actor: SafeUser | string,
  filter?: ListAssessmentsFilter
) {
  const actorUserId = typeof actor === 'string' ? actor : actor.id;
  await requirePermission(actorUserId, PermissionCode.ASSESSMENT_VIEW);

  const where: Prisma.AssessmentWhereInput = {};
  if (filter?.programmeId) where.programmeId = filter.programmeId;
  if (filter?.schoolClassId) where.schoolClassId = filter.schoolClassId;
  if (filter?.subjectId) where.subjectId = filter.subjectId;
  if (filter?.academicSessionId) where.academicSessionId = filter.academicSessionId;
  if (filter?.academicTermId) where.academicTermId = filter.academicTermId;
  if (filter?.status) where.status = filter.status;
  if (filter?.type) where.type = filter.type;

  return prisma.assessment.findMany({
    where,
    include: {
      programme: { select: { id: true, name: true, code: true } },
      schoolClass: { select: { id: true, name: true, code: true } },
      subject: { select: { id: true, name: true, code: true } },
      academicSession: { select: { id: true, name: true } },
      academicTerm: { select: { id: true, name: true } },
      gradingScale: { select: { id: true, name: true, code: true } },
      createdBy: {
        select: {
          id: true,
          email: true,
        },
      },
      _count: {
        select: { scores: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

