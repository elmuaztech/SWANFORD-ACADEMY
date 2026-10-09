import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth/request_auth';
import { requirePermission, AuthorizationError } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { getConfiguredApplicationFormFeeKobo } from '@/lib/admissions/fee_calculation';
import { toUserFacingError } from '@/lib/ui/error_messages';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const UpdateFormFeeSchema = z.object({
  formFeeNaira: z.number().positive('Form fee must be greater than zero'),
});

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await requirePermission(actor, PermissionCode.FINANCE_INVOICE_VIEW);

    const formFeeKobo = await getConfiguredApplicationFormFeeKobo(prisma);

    return NextResponse.json({
      success: true,
      formFeeKobo: formFeeKobo.toString(),
      formFeeNaira: Number(formFeeKobo) / 100,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: toUserFacingError(error) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await requirePermission(actor, PermissionCode.SYSTEM_CONFIG_MANAGE);

    const body = await request.json();
    const validated = UpdateFormFeeSchema.parse(body);

    const newKobo = BigInt(Math.round(validated.formFeeNaira * 100));

    await prisma.systemConfig.upsert({
      where: { key: 'admissions.form_fee_kobo' },
      update: {
        value: newKobo.toString(),
      },
      create: {
        key: 'admissions.form_fee_kobo',
        value: newKobo.toString(),
        description: 'Configured application form fee charged to prospective students (in Kobo)',
      },
    });

    // Create Audit Log
    try {
      await prisma.auditLog.create({
        data: {
          userId: actor.id,
          action: 'FORM_FEE_UPDATE',
          entityType: 'SYSTEM_CONFIG',
          entityId: 'admissions.form_fee_kobo',
          newValues: {
            newFeeNaira: validated.formFeeNaira,
            newFeeKobo: newKobo.toString(),
          },
        },
      });
    } catch {
      // Non-blocking
    }

    return NextResponse.json({
      success: true,
      message: `Application form fee updated successfully to ₦${validated.formFeeNaira.toLocaleString()}.`,
      formFeeKobo: newKobo.toString(),
      formFeeNaira: validated.formFeeNaira,
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
