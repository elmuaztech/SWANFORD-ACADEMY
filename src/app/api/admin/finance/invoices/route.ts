import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { listInvoices } from '@/lib/finance/invoice_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { InvoiceStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const academicSessionId = searchParams.get('sessionId') || undefined;
    const academicTermId = searchParams.get('termId') || undefined;
    const programmeId = searchParams.get('programmeId') || undefined;
    const studentId = searchParams.get('studentId') || undefined;
    const status = (searchParams.get('status') as InvoiceStatus) || undefined;

    const invoices = await listInvoices(actor, {
      academicSessionId,
      academicTermId,
      programmeId,
      studentId,
      status,
    });

    const serialized = invoices.map((inv) => ({
      ...inv,
      totalAmountKobo: inv.totalAmountKobo.toString(),
      amountPaidKobo: inv.amountPaidKobo.toString(),
      outstandingBalanceKobo: inv.outstandingBalanceKobo.toString(),
      items: inv.items.map((item) => ({
        ...item,
        unitAmountKobo: item.unitAmountKobo.toString(),
        totalAmountKobo: item.totalAmountKobo.toString(),
      })),
    }));

    return NextResponse.json(serialized);
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to retrieve invoices.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
