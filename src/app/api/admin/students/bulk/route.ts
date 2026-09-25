import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { executeBulkStudentEnrollment } from '@/lib/students/bulk_enrollment';
import { AuthorizationError, requirePermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await requirePermission(actor, PermissionCode.ENROLLMENT_MANAGE);

    const body = await request.json();

    let academicSessionId = body.academicSessionId;
    let academicTermId = body.academicTermId;

    if (!academicSessionId || !academicTermId) {
      const currentTerm = await prisma.academicTerm.findFirst({
        where: { isCurrent: true },
        include: { academicSession: true },
      });

      if (currentTerm) {
        academicSessionId = currentTerm.academicSessionId;
        academicTermId = currentTerm.id;
      } else {
        const latestSession = await prisma.academicSession.findFirst({
          orderBy: { startDate: 'desc' },
          include: { terms: { orderBy: { startDate: 'asc' } } },
        });

        if (latestSession && latestSession.terms.length > 0) {
          academicSessionId = latestSession.id;
          academicTermId = latestSession.terms[0].id;
        }
      }
    }

    if (!academicSessionId || !academicTermId) {
      return NextResponse.json(
        { error: 'Academic session and term must be configured before bulk student enrollment.' },
        { status: 400 }
      );
    }

    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No pupil records provided for enrollment.' },
        { status: 400 }
      );
    }

    const result = await executeBulkStudentEnrollment(
      {
        academicSessionId,
        academicTermId,
        sourceType: 'MANUAL_BULK_ENTRY',
        rows,
      },
      actor.id
    );

    return NextResponse.json({
      success: true,
      result,
      message: `Bulk enrollment completed. ${result.totalSuccessful} pupil(s) enrolled successfully, ${result.totalFailed} failed.`,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Bulk enrollment failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
