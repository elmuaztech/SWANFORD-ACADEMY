import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { requireAnyPermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import {
  getOutstandingFeesOverview,
  sendPaymentRemindersNow,
} from '@/lib/finance/reminder_service';
import { ReminderTargetType } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await requireAnyPermission(actor, [
      PermissionCode.FINANCE_INVOICE_VIEW,
      PermissionCode.FINANCE_REPORT_VIEW,
      PermissionCode.FINANCE_INVOICE_MANAGE,
    ]);

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId') || undefined;
    const termId = searchParams.get('termId') || undefined;

    const overview = await getOutstandingFeesOverview(sessionId, termId);

    return NextResponse.json(overview);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve outstanding fees.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await requireAnyPermission(actor, [
      PermissionCode.FINANCE_INVOICE_MANAGE,
      PermissionCode.COMMUNICATION_ANNOUNCE,
    ]);

    const body = await request.json().catch(() => ({}));
    const { sessionId, termId, targetType } = body;

    const result = await sendPaymentRemindersNow({
      sessionId,
      termId,
      targetType: (targetType as ReminderTargetType) || ReminderTargetType.ALL_OUTSTANDING,
      createdById: actor.id,
    });

    return NextResponse.json({
      success: true,
      message: `Payment reminders dispatched: ${result.totalSent} notifications created for ${result.totalTargeted} eligible accounts.`,
      result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to send payment reminders.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
