import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import {
  compileStudentReport,
  getReportTemplateConfig,
  renderReportHtml,
} from '@/lib/reports/report_engine';
import { AuthorizationError, requirePermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';

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

    await requirePermission(actor.id, PermissionCode.ASSESSMENT_VIEW);

    const { searchParams } = new URL(request.url);
    const termId = searchParams.get('termId');
    const sessionId = searchParams.get('sessionId') || undefined;
    const format = searchParams.get('format') || 'html';

    if (!termId) {
      return NextResponse.json(
        { error: "Query parameter 'termId' is required." },
        { status: 400 }
      );
    }

    const reportData = await compileStudentReport(studentId, termId, sessionId);

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
    const message = error instanceof Error ? error.message : 'Failed to generate report sheet.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
