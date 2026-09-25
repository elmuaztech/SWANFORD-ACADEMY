import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { prisma } from '@/lib/prisma';
import { getReportTemplateConfig } from '@/lib/reports/report_engine';
import { AuthorizationError, requirePermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId') || undefined;

    const config = await getReportTemplateConfig(sessionId);
    return NextResponse.json({ success: true, config });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to retrieve template.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await requirePermission(actor.id, PermissionCode.SYSTEM_CONFIG_MANAGE);

    const body = await request.json();
    const {
      name,
      schoolName,
      schoolAddress,
      schoolPhone,
      schoolEmail,
      schoolMotto,
      primaryColor,
      accentColor,
      fontFamily,
      fontSize,
      tableBorderColor,
      showAttendance,
      showPosition,
      showClassAverage,
      showTeacherComment,
      showDirectorComment,
      academicSessionId,
    } = body;

    // Find existing default or create
    const existing = await prisma.reportTemplateConfig.findFirst({
      where: academicSessionId ? { academicSessionId } : { isDefault: true },
    });

    let updated;
    if (existing) {
      updated = await prisma.reportTemplateConfig.update({
        where: { id: existing.id },
        data: {
          name: name !== undefined ? name : undefined,
          schoolName: schoolName !== undefined ? schoolName : undefined,
          schoolAddress: schoolAddress !== undefined ? schoolAddress : undefined,
          schoolPhone: schoolPhone !== undefined ? schoolPhone : undefined,
          schoolEmail: schoolEmail !== undefined ? schoolEmail : undefined,
          schoolMotto: schoolMotto !== undefined ? schoolMotto : undefined,
          primaryColor: primaryColor !== undefined ? primaryColor : undefined,
          accentColor: accentColor !== undefined ? accentColor : undefined,
          fontFamily: fontFamily !== undefined ? fontFamily : undefined,
          fontSize: fontSize !== undefined ? fontSize : undefined,
          tableBorderColor: tableBorderColor !== undefined ? tableBorderColor : undefined,
          showAttendance: showAttendance !== undefined ? showAttendance : undefined,
          showPosition: showPosition !== undefined ? showPosition : undefined,
          showClassAverage: showClassAverage !== undefined ? showClassAverage : undefined,
          showTeacherComment: showTeacherComment !== undefined ? showTeacherComment : undefined,
          showDirectorComment: showDirectorComment !== undefined ? showDirectorComment : undefined,
        },
      });
    } else {
      updated = await prisma.reportTemplateConfig.create({
        data: {
          name: name || 'Official Swanford Primary Report Template',
          isDefault: true,
          schoolName: schoolName || 'SWANFORD ACADEMY',
          schoolAddress: schoolAddress || 'Plot 212, Dr Nuhu Muhammadu Sanusi Way, Dutse, Jigawa State, Nigeria',
          schoolPhone: schoolPhone || '09068897489, 08103807498',
          schoolEmail: schoolEmail || 'Swanford99@gmail.com',
          schoolMotto: schoolMotto || 'Nursery, Primary & Tahfeez School',
          primaryColor: primaryColor || '#5B0612',
          accentColor: accentColor || '#C49A45',
          fontFamily: fontFamily || 'Inter',
          fontSize: fontSize || '11px',
          tableBorderColor: tableBorderColor || '#D1D5DB',
          showAttendance: showAttendance ?? true,
          showPosition: showPosition ?? true,
          showClassAverage: showClassAverage ?? true,
          showTeacherComment: showTeacherComment ?? true,
          showDirectorComment: showDirectorComment ?? true,
          academicSessionId: academicSessionId || null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Report template configuration updated successfully.',
      config: updated,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to update template.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
