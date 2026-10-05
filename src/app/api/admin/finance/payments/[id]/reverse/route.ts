import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { reversePayment } from '@/lib/finance/payment_service';
import { AuthorizationError } from '@/lib/auth/authorization';

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

    const { id } = await params;
    const body = await request.json();

    if (!body.reversalReason || typeof body.reversalReason !== 'string' || body.reversalReason.trim().length === 0) {
      return NextResponse.json(
        { error: 'Reversal reason is required to perform a payment reversal.' },
        { status: 400 }
      );
    }

    const result = await reversePayment(actor, id, body.reversalReason.trim());

    return NextResponse.json({
      success: true,
      payment: {
        ...result,
        amountKobo: result.amountKobo.toString(),
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Failed to reverse payment.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
