import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { voidExpense } from '@/lib/finance/expense_service';
import { AuthorizationError } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const reason = body?.reason;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json({ error: 'A specific reason is required to void an expense.' }, { status: 400 });
    }

    const voided = await voidExpense(actor, id, reason.trim());

    return NextResponse.json({
      id: voided.id,
      expenseNumber: voided.expenseNumber,
      status: voided.status,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to void expense.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
