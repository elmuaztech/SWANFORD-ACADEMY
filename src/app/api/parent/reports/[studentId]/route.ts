import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { prisma } from '@/lib/prisma';
import {
  compileStudentReport,
  getReportTemplateConfig,
  renderReportHtml,
} from '@/lib/reports/report_engine';
import { AuthorizationError } from '@/lib/auth/authorization';
import { ReportReleaseStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const { studentId } = await params;
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    // Verify actor is guardian of this student or an administrator
    const roles = actor.roles || [];
    const isStaff = roles.some((r) =>
      ['SUPER_ADMIN', 'ADMIN', 'TEACHER'].includes(r)
    );

    if (!isStaff) {
      // Must be an active guardian of this student
      const guardian = await prisma.guardian.findUnique({
        where: { userId: actor.id },
      });

      if (!guardian) {
        return NextResponse.json({ error: 'Guardian account not found.' }, { status: 403 });
      }

      const link = await prisma.guardianStudentRelationship.findFirst({
        where: {
          guardianId: guardian.id,
          studentId,
          status: 'ACTIVE',
        },
      });

      if (!link) {
        return NextResponse.json(
          { error: 'You are not authorized to view academic records for this student.' },
          { status: 403 }
        );
      }
    }

    const { searchParams } = new URL(request.url);
    const termId = searchParams.get('termId');
    const sessionId = searchParams.get('sessionId') || undefined;
    const format = searchParams.get('format') || 'html';

    if (!termId) {
      // Find latest term if not provided
      const currentTerm = await prisma.academicTerm.findFirst({
        where: { isCurrent: true },
      });
      if (!currentTerm) {
        return NextResponse.json({ error: 'No active academic term found.' }, { status: 400 });
      }
    }

    const effectiveTermId = termId || (await prisma.academicTerm.findFirst({ where: { isCurrent: true } }))?.id;
    if (!effectiveTermId) {
      return NextResponse.json({ error: 'Academic term is required.' }, { status: 400 });
    }

    // Check if report has been officially released for parents
    if (!isStaff) {
      const release = await prisma.reportRelease.findFirst({
        where: {
          academicTermId: effectiveTermId,
          status: ReportReleaseStatus.RELEASED,
          OR: [
            { studentId },
            { studentId: null },
          ],
        },
      });

      if (!release) {
        return NextResponse.json(
          { error: 'Terminal report sheets for this term have not been officially released by school administration yet.' },
          { status: 403 }
        );
      }
    }

    const reportData = await compileStudentReport(studentId, effectiveTermId, sessionId);

    if (format === 'json') {
      return NextResponse.json({ success: true, report: reportData });
    }

    const templateConfig = await getReportTemplateConfig(sessionId);
    const html = renderReportHtml(reportData, templateConfig);

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to retrieve report sheet.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
