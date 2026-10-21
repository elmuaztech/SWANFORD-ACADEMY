import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { toggleSpecialFeeRateStatus } from '@/lib/finance/special_rate_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const isActive = Boolean(body.isActive);

    const updated = await toggleSpecialFeeRateStatus(actor, id, isActive);

    return NextResponse.json({
      success: true,
      message: `Special fee rate ${isActive ? 'activated' : 'deactivated'}.`,
      rate: {
        ...updated,
        customAmountKobo: updated.customAmountKobo?.toString() || null,
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to update special fee rate.';
    return NextResponse.json({ error: message }, { status: 500 });
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

    await requirePermission(actor, PermissionCode.FINANCE_INVOICE_MANAGE);
    const { id } = await params;

    await prisma.studentSpecialFeeRate.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Special fee rate deleted.',
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to delete special fee rate.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
