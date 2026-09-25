import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { requirePermission, AuthorizationError } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { prisma } from '@/lib/prisma';
import { AcademicSessionStatus, AcademicTermStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/academic/sessions/[id]/active
 * Sets the specified academic session as the currently active session.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await requirePermission(actor, PermissionCode.SYSTEM_CONFIG_MANAGE);
    const { id } = await params;

    const targetSession = await prisma.academicSession.findUnique({
      where: { id },
      include: { terms: { orderBy: { startDate: 'asc' } } },
    });

    if (!targetSession) {
      return NextResponse.json({ error: 'Academic session not found.' }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      // Deactivate all other sessions
      await tx.academicSession.updateMany({
        where: { id: { not: id } },
        data: { isCurrent: false },
      });

      // Activate target session
      await tx.academicSession.update({
        where: { id },
        data: {
          isCurrent: true,
          status: AcademicSessionStatus.ACTIVE,
        },
      });

      // If no term in this session is marked current, activate the First Term
      const hasActiveTerm = targetSession.terms.some((t) => t.isCurrent);
      if (!hasActiveTerm && targetSession.terms.length > 0) {
        await tx.academicTerm.update({
          where: { id: targetSession.terms[0].id },
          data: {
            isCurrent: true,
            status: AcademicTermStatus.ACTIVE,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'ACADEMIC_SESSION_ACTIVATED',
          entityType: 'AcademicSession',
          entityId: id,
          newValues: { name: targetSession.name, isCurrent: true },
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: `Academic session "${targetSession.name}" is now set as active.`,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to set active academic session.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
