import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { releaseTerminalReports } from '@/lib/reports/report_engine';
import { AuthorizationError } from '@/lib/auth/authorization';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();
    const { schoolClassId, studentId, notes } = body;
    let { academicSessionId, academicTermId } = body;

    // Automatically resolve current term & session if not explicitly provided
    if (!academicSessionId || !academicTermId) {
      const activeTerm = await prisma.academicTerm.findFirst({
        where: { isCurrent: true },
      });

      if (activeTerm) {
        academicTermId = academicTermId || activeTerm.id;
        academicSessionId = academicSessionId || activeTerm.academicSessionId;
      } else {
        const fallbackTerm = await prisma.academicTerm.findFirst({
          orderBy: { createdAt: 'desc' },
        });
        if (fallbackTerm) {
          academicTermId = academicTermId || fallbackTerm.id;
          academicSessionId = academicSessionId || fallbackTerm.academicSessionId;
        }
      }
    }

    if (!academicSessionId || !academicTermId) {
      return NextResponse.json(
        { error: 'Please choose an academic term or configure an active term before releasing report sheets.' },
        { status: 400 }
      );
    }

    const result = await releaseTerminalReports(actor, {
      academicSessionId,
      academicTermId,
      schoolClassId,
      studentId,
      notes,
    });

    return NextResponse.json({
      success: true,
      message: `Successfully released reports for ${result.affectedStudentsCount} students and notified ${result.guardiansNotifiedCount} guardians.`,
      result,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to release reports.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
