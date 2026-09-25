import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { requireAnyPermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { cancelScheduledReminder } from '@/lib/finance/reminder_service';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await requireAnyPermission(actor, [
      PermissionCode.FINANCE_INVOICE_MANAGE,
      PermissionCode.COMMUNICATION_ANNOUNCE,
    ]);

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Reminder ID is required.' }, { status: 400 });
    }

    const cancelled = await cancelScheduledReminder(id);

    return NextResponse.json({
      success: true,
      message: 'Scheduled reminder was successfully cancelled.',
      reminder: cancelled,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to cancel scheduled reminder.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
