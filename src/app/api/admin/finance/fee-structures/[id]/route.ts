import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth/request_auth';
import { requirePermission, AuthorizationError } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { FeeApplicableGender } from '@prisma/client';
import { toUserFacingError } from '@/lib/ui/error_messages';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const UpdateFeeStructureSchema = z.object({
  name: z.string().min(2, 'Fee structure name is required').max(100).trim().optional(),
  applicableGender: z.nativeEnum(FeeApplicableGender).optional(),
  isAdmissionFee: z.boolean().optional(),
  isActive: z.boolean().optional(),
  items: z
    .array(
      z.object({
        name: z.string().min(1, 'Fee item name is required').trim(),
        amountNaira: z.number().nonnegative('Amount cannot be negative'),
      })
    )
    .min(1, 'At least one fee item is required')
    .optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await requirePermission(actor, PermissionCode.FINANCE_INVOICE_VIEW);
    const { id } = await params;

    const fs = await prisma.feeStructure.findUnique({
      where: { id },
      include: {
        academicSession: true,
        academicTerm: true,
        programme: true,
        schoolClass: true,
        feeItems: { orderBy: { amountKobo: 'desc' } },
      },
    });

    if (!fs) {
      return NextResponse.json({ error: 'Fee structure not found.' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      feeStructure: {
        id: fs.id,
        name: fs.name,
        sessionId: fs.academicSessionId,
        sessionName: fs.academicSession.name,
        termId: fs.academicTermId,
        termName: fs.academicTerm.name,
        programmeId: fs.programmeId,
        programmeName: fs.programme.name,
        schoolClassId: fs.schoolClassId,
        className: fs.schoolClass?.name || 'All Classes in Programme',
        applicableGender: fs.applicableGender,
        isAdmissionFee: fs.isAdmissionFee,
        isActive: fs.isActive,
        items: fs.feeItems.map((item) => ({
          id: item.id,
          name: item.name,
          amountNaira: Number(item.amountKobo) / 100,
        })),
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: toUserFacingError(error) }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await requirePermission(actor, PermissionCode.FEE_STRUCTURE_MANAGE);
    const { id } = await params;

    const body = await request.json();
    const validated = UpdateFeeStructureSchema.parse(body);

    const existing = await prisma.feeStructure.findUnique({
      where: { id },
      include: { feeItems: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Fee structure not found.' }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update basic fields
      const updatedStructure = await tx.feeStructure.update({
        where: { id },
        data: {
          ...(validated.name !== undefined ? { name: validated.name } : {}),
          ...(validated.applicableGender !== undefined ? { applicableGender: validated.applicableGender } : {}),
          ...(validated.isAdmissionFee !== undefined ? { isAdmissionFee: validated.isAdmissionFee } : {}),
          ...(validated.isActive !== undefined ? { isActive: validated.isActive } : {}),
        },
      });

      // 2. If items provided, replace fee items
      if (validated.items && validated.items.length > 0) {
        await tx.feeItem.deleteMany({
          where: { feeStructureId: id },
        });

        await tx.feeItem.createMany({
          data: validated.items.map((item) => ({
            feeStructureId: id,
            name: item.name,
            amountKobo: BigInt(Math.round(item.amountNaira * 100)),
          })),
        });
      }

      return updatedStructure;
    });

    // Audit Log
    try {
      await prisma.auditLog.create({
        data: {
          userId: actor.id,
          action: 'FEE_STRUCTURE_UPDATE',
          entityType: 'FEE_STRUCTURE',
          entityId: id,
          newValues: { updatedFields: Object.keys(validated) },
        },
      });
    } catch {
      // Non-blocking
    }

    return NextResponse.json({
      success: true,
      message: 'Fee structure updated successfully.',
      feeStructure: updated,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Invalid input.' }, { status: 400 });
    }
    const userError = toUserFacingError(error);
    return NextResponse.json({ error: userError.message || userError.title }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await requirePermission(actor, PermissionCode.FEE_STRUCTURE_MANAGE);
    const { id } = await params;

    const existing = await prisma.feeStructure.findUnique({
      where: { id },
      include: { invoices: { select: { id: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Fee structure not found.' }, { status: 404 });
    }

    // If invoices are linked, soft-deactivate rather than hard delete to preserve financial ledger
    if (existing.invoices.length > 0) {
      await prisma.feeStructure.update({
        where: { id },
        data: { isActive: false },
      });

      return NextResponse.json({
        success: true,
        message: 'Fee structure has linked invoices; it has been deactivated successfully.',
      });
    }

    // Otherwise, clean delete
    await prisma.feeStructure.delete({
      where: { id },
    });

    // Audit Log
    try {
      await prisma.auditLog.create({
        data: {
          userId: actor.id,
          action: 'FEE_STRUCTURE_DELETE',
          entityType: 'FEE_STRUCTURE',
          entityId: id,
          newValues: { name: existing.name },
        },
      });
    } catch {
      // Non-blocking
    }

    return NextResponse.json({
      success: true,
      message: 'Fee structure deleted successfully.',
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const userError = toUserFacingError(error);
    return NextResponse.json({ error: userError.message || userError.title }, { status: 500 });
  }
}
