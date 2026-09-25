import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { requirePermission, AuthorizationError } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { prisma } from '@/lib/prisma';
import { AcademicTermStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/academic/sessions/[id]/terms/[termId]
 * Opens, closes, or activates a specific term within an academic session.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; termId: string }> }
) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await requirePermission(actor, PermissionCode.SYSTEM_CONFIG_MANAGE);
    const { id, termId } = await params;

    const term = await prisma.academicTerm.findUnique({
      where: { id: termId },
      include: { academicSession: true },
    });

    if (!term || term.academicSessionId !== id) {
      return NextResponse.json({ error: 'Academic term not found in this session.' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { action, status } = body;

    await prisma.$transaction(async (tx) => {
      if (action === 'ACTIVATE') {
        // Deactivate other terms in this session
        await tx.academicTerm.updateMany({
          where: { academicSessionId: id },
          data: { isCurrent: false },
        });

        await tx.academicTerm.update({
          where: { id: termId },
          data: {
            isCurrent: true,
            status: AcademicTermStatus.ACTIVE,
          },
        });
      } else if (action === 'CLOSE') {
        await tx.academicTerm.update({
          where: { id: termId },
          data: {
            isCurrent: false,
            status: AcademicTermStatus.COMPLETED,
          },
        });
      } else if (status && Object.values(AcademicTermStatus).includes(status)) {
        await tx.academicTerm.update({
          where: { id: termId },
          data: { status },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'ACADEMIC_TERM_UPDATED',
          entityType: 'AcademicTerm',
          entityId: termId,
          newValues: { action, status, termName: term.name },
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: `Term "${term.name}" updated successfully.`,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to update academic term.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
