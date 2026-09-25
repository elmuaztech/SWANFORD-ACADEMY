import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { requireAnyPermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import {
  listScheduledReminders,
  schedulePaymentReminder,
} from '@/lib/finance/reminder_service';
import { ReminderScheduleStatus, ReminderTargetType } from '@prisma/client';

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
    const status = (searchParams.get('status') as ReminderScheduleStatus) || undefined;

    const reminders = await listScheduledReminders({ sessionId, termId, status });

    return NextResponse.json(reminders);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list scheduled reminders.';
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

    const body = await request.json();
    const { scheduledFor, sessionId, termId, targetType } = body;

    if (!scheduledFor) {
      return NextResponse.json({ error: 'Scheduled date and time is required.' }, { status: 400 });
    }

    const scheduledDate = new Date(scheduledFor);
    if (isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date/time format.' }, { status: 400 });
    }

    if (scheduledDate.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Scheduled time must be in the future.' }, { status: 400 });
    }

    const scheduled = await schedulePaymentReminder({
      scheduledFor: scheduledDate,
      sessionId,
      termId,
      targetType: (targetType as ReminderTargetType) || ReminderTargetType.ALL_OUTSTANDING,
      createdById: actor.id,
    });

    return NextResponse.json({
      success: true,
      message: 'Payment reminder scheduled successfully. The server will process it automatically at the scheduled time.',
      reminder: scheduled,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to schedule payment reminder.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
