import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { listPayments } from '@/lib/finance/payment_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { PaymentStatus, PaymentMethod } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const invoiceId = searchParams.get('invoiceId') || undefined;
    const studentId = searchParams.get('studentId') || undefined;
    const status = (searchParams.get('status') as PaymentStatus) || undefined;
    const paymentMethod = (searchParams.get('paymentMethod') as PaymentMethod) || undefined;

    const payments = await listPayments(actor, {
      invoiceId,
      studentId,
      status,
      paymentMethod,
    });

    const serialized = payments.map((p) => ({
      ...p,
      amountKobo: p.amountKobo.toString(),
      receipt: p.receipt
        ? {
            ...p.receipt,
            amountKobo: p.receipt.amountKobo.toString(),
          }
        : null,
      invoice: p.invoice
        ? {
            ...p.invoice,
            totalAmountKobo: p.invoice.totalAmountKobo.toString(),
          }
        : null,
      allocations: p.allocations.map((a) => ({
        ...a,
        amountKobo: a.amountKobo.toString(),
      })),
    }));

    return NextResponse.json(serialized);
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to retrieve payments.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
