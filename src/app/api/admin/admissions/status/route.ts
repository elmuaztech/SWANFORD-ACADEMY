import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAuthUser } from '@/lib/auth/request_auth';
import { requirePermission, AuthorizationError } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { prisma } from '@/lib/prisma';
import { AdmissionCycleStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/admissions/status
 * Returns the current admission open/close status, active session name, and cycles.
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    // Find the currently active academic session
    const activeSession = await prisma.academicSession.findFirst({
      where: { isCurrent: true },
      include: {
        admissionCycles: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    // Also get all sessions for the session selector dropdown
    const allSessions = await prisma.academicSession.findMany({
      select: { id: true, name: true, isCurrent: true },
      orderBy: { startDate: 'desc' },
      take: 10,
    });

    const activeCycle = activeSession?.admissionCycles?.[0] || null;
    const isOpen = activeCycle ? activeCycle.status === AdmissionCycleStatus.OPEN : false;
    const activeSessionName = activeSession?.name || 'Upcoming Session';

    return NextResponse.json({
      isOpen,
      activeSessionName,
      activeSessionId: activeSession?.id || null,
      activeCycleId: activeCycle?.id || null,
      cycleName: activeCycle?.name || null,
      currentSession: activeSession ? { id: activeSession.id, name: activeSession.name } : null,
      allSessions,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve admission status.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/admin/admissions/status
 * Opens or closes admissions for an academic session.
 * Supports { action: "OPEN" | "CLOSE" } or { isOpen: boolean }
 * Supports sessionId or academicSessionId
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await requirePermission(actor, PermissionCode.ADMISSION_CYCLE_MANAGE);

    const body = await request.json().catch(() => ({}));
    const rawSessionId = body.sessionId || body.academicSessionId;
    
    // Support either action ("OPEN"/"CLOSE") or boolean isOpen
    let resolvedAction: 'OPEN' | 'CLOSE' | null = null;
    if (typeof body.isOpen === 'boolean') {
      resolvedAction = body.isOpen ? 'OPEN' : 'CLOSE';
    } else if (typeof body.action === 'string' && ['OPEN', 'CLOSE'].includes(body.action.toUpperCase())) {
      resolvedAction = body.action.toUpperCase() as 'OPEN' | 'CLOSE';
    }

    if (!resolvedAction) {
      return NextResponse.json(
        { error: 'Valid action ("OPEN" or "CLOSE" or isOpen boolean) is required.' },
        { status: 400 }
      );
    }

    // Determine target session (specified or current active session)
    let targetSession = null;
    if (rawSessionId) {
      targetSession = await prisma.academicSession.findUnique({
        where: { id: rawSessionId },
        include: { admissionCycles: { orderBy: { createdAt: 'desc' } } },
      });
    } else {
      targetSession = await prisma.academicSession.findFirst({
        where: { isCurrent: true },
        include: { admissionCycles: { orderBy: { createdAt: 'desc' } } },
      });
    }

    if (!targetSession) {
      return NextResponse.json({ error: 'Academic session not found.' }, { status: 404 });
    }

    const isOpen = resolvedAction === 'OPEN';

    await prisma.$transaction(async (tx) => {
      let cycle = targetSession!.admissionCycles[0];

      if (!isOpen) {
        // Close all open cycles across the school
        await tx.admissionCycle.updateMany({
          where: { status: AdmissionCycleStatus.OPEN },
          data: { status: AdmissionCycleStatus.CLOSED },
        });
      } else {
        if (!cycle) {
          // Create an admission cycle if one does not exist for this session
          const startYear = targetSession!.startDate.getFullYear();
          cycle = await tx.admissionCycle.create({
            data: {
              academicSessionId: targetSession!.id,
              code: `ADM-${startYear}-MAIN`,
              name: `${targetSession!.name} Main Admission`,
              startDate: new Date(),
              endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
              status: AdmissionCycleStatus.OPEN,
              description: `Admissions cycle for ${targetSession!.name}`,
            },
          });
        }

        // Close any other open cycles
        await tx.admissionCycle.updateMany({
          where: {
            id: { not: cycle.id },
            status: AdmissionCycleStatus.OPEN,
          },
          data: { status: AdmissionCycleStatus.CLOSED },
        });

        cycle = await tx.admissionCycle.update({
          where: { id: cycle.id },
          data: { status: AdmissionCycleStatus.OPEN },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: isOpen ? 'ADMISSIONS_OPENED' : 'ADMISSIONS_CLOSED',
          entityType: 'AdmissionCycle',
          entityId: cycle?.id || targetSession!.id,
          newValues: {
            sessionName: targetSession!.name,
            status: isOpen ? AdmissionCycleStatus.OPEN : AdmissionCycleStatus.CLOSED,
          },
        },
      });
    });

    // Revalidate public caches immediately so changes reflect instantly
    try {
      revalidatePath('/', 'page');
      revalidatePath('/admissions', 'page');
      revalidatePath('/api/public/admission-options');
    } catch {
      // Ignore revalidation errors in non-standard execution contexts
    }

    return NextResponse.json({
      success: true,
      isOpen,
      activeSessionName: targetSession.name,
      sessionName: targetSession.name,
      message: isOpen
        ? `Admissions for ${targetSession.name} are now open.`
        : `Admissions for ${targetSession.name} are now closed.`,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to update admissions status.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
