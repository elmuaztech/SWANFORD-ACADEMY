import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import {
  compileStudentReport,
  getReportTemplateConfig,
  getSampleReportData,
  renderReportHtml,
} from '@/lib/reports/report_engine';
import { AuthorizationError, requirePermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/reports/preview
 * Returns on-demand HTML preview of the official Swanford A4 report sheet.
 * Can render real student data or official specimen data for director visual approval and test printing.
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await requirePermission(actor.id, PermissionCode.ASSESSMENT_VIEW);

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    const termId = searchParams.get('termId');
    const sessionId = searchParams.get('sessionId') || undefined;
    const format = searchParams.get('format') || 'html';

    const templateConfig = await getReportTemplateConfig(sessionId);

    let reportData;
    if (studentId && termId) {
      reportData = await compileStudentReport(studentId, termId, sessionId);
    } else {
      // Use official Swanford Nursery & Primary specimen data
      reportData = getSampleReportData();
    }

    if (format === 'json') {
      return NextResponse.json({ success: true, report: reportData, config: templateConfig });
    }

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
    const message = error instanceof Error ? error.message : 'Failed to generate report sheet preview.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
