import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { confirmOrReconcilePayment } from '@/lib/finance/payment_service';
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

    const result = await confirmOrReconcilePayment(actor, {
      paymentId: id,
      bankReference: body.bankReference,
      bankName: body.bankName,
      notes: body.notes,
    });

    return NextResponse.json({
      success: true,
      payment: {
        ...result.payment,
        amountKobo: result.payment.amountKobo.toString(),
      },
      receipt: result.receipt
        ? {
            ...result.receipt,
            amountKobo: result.receipt.amountKobo.toString(),
          }
        : null,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Failed to reconcile payment.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
