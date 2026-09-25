import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { prisma } from '@/lib/prisma';
import { AuthorizationError, requirePermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { EnrollmentStatus, ReportReleaseStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await requirePermission(actor.id, PermissionCode.REPORT_GENERATE);

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId') || undefined;
    const termId = searchParams.get('termId') || undefined;
    const programmeId = searchParams.get('programmeId') || undefined;
    const classId = searchParams.get('classId') || undefined;

    // Fetch academic sessions & terms
    const sessions = await prisma.academicSession.findMany({
      orderBy: { startDate: 'desc' },
      include: {
        terms: {
          orderBy: { startDate: 'asc' },
        },
      },
    });

    // Fetch active programmes & classes
    const programmes = await prisma.programme.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        classes: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
        },
      },
    });

    // Resolve target session and term
    const resolvedSession = sessionId 
      ? sessions.find((s) => s.id === sessionId) 
      : sessions.find((s) => s.isCurrent) || sessions[0];
    
    const resolvedTerm = termId && resolvedSession
      ? resolvedSession.terms.find((t) => t.id === termId)
      : resolvedSession?.terms.find((t) => t.isCurrent) || resolvedSession?.terms[0];

    // If no session or term exist, return empty
    if (!resolvedSession || !resolvedTerm) {
      return NextResponse.json({
        success: true,
        sessions,
        programmes,
        selectedSessionId: null,
        selectedTermId: null,
        students: [],
      });
    }

    // Query enrolled students
    const enrollments = await prisma.studentProgrammeEnrollment.findMany({
      where: {
        academicSessionId: resolvedSession.id,
        academicTermId: resolvedTerm.id,
        enrollmentStatus: EnrollmentStatus.ACTIVE,
        ...(programmeId && programmeId !== 'ALL' ? { programmeId } : {}),
        ...(classId && classId !== 'ALL' ? { schoolClassId: classId } : {}),
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
            currentStatus: true,
          },
        },
        programme: { select: { id: true, name: true, code: true } },
        schoolClass: { select: { id: true, name: true, code: true } },
      },
      orderBy: [
        { schoolClass: { name: 'asc' } },
        { student: { lastName: 'asc' } },
        { student: { firstName: 'asc' } },
      ],
    });

    // Query release records for this session & term
    const releaseRecords = await prisma.reportRelease.findMany({
      where: {
        academicSessionId: resolvedSession.id,
        academicTermId: resolvedTerm.id,
        status: ReportReleaseStatus.RELEASED,
      },
    });

    const releasedStudentIds = new Set(
      releaseRecords.filter((r) => r.studentId).map((r) => r.studentId!)
    );
    const releasedClassIds = new Set(
      releaseRecords.filter((r) => r.schoolClassId && !r.studentId).map((r) => r.schoolClassId!)
    );

    // Get score counts for each student in this term
    const studentIds = enrollments.map((e) => e.student.id);
    const scoreCounts = await prisma.assessmentScore.groupBy({
      by: ['studentId'],
      where: {
        studentId: { in: studentIds },
        assessment: {
          academicTermId: resolvedTerm.id,
          status: 'APPROVED',
        },
        scoreStatus: 'SCORED',
      },
      _count: {
        id: true,
      },
    });

    const scoreMap = new Map<string, number>();
    for (const sc of scoreCounts) {
      scoreMap.set(sc.studentId, sc._count.id);
    }

    const students = enrollments.map((enr) => {
      const isReleased = 
        releasedStudentIds.has(enr.student.id) || 
        releasedClassIds.has(enr.schoolClass.id);
      return {
        id: enr.student.id,
        admissionNumber: enr.student.admissionNumber,
        fullName: `${enr.student.firstName} ${enr.student.lastName}`.trim(),
        gender: enr.student.gender,
        programme: enr.programme,
        schoolClass: enr.schoolClass,
        approvedScoresCount: scoreMap.get(enr.student.id) || 0,
        isReleased,
      };
    });

    return NextResponse.json({
      success: true,
      sessions,
      programmes,
      selectedSessionId: resolvedSession.id,
      selectedTermId: resolvedTerm.id,
      students,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to retrieve reports.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
