import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { listPayments } from '@/lib/finance/payment_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { PaymentStatus, PaymentMethod } from '@prisma/client';
import { prisma } from '@/lib/prisma';

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
      type: 'TUITION',
    }));

    // If viewing general ledger without invoice/student filter, include confirmed application fee payments
    let combined: any[] = serialized;
    if (!invoiceId && !studentId && (!status || status === PaymentStatus.CONFIRMED)) {
      const appPayments = await prisma.application.findMany({
        where: { paymentStatus: 'PAYMENT_CONFIRMED' },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          applicationNumber: true,
          paymentReference: true,
          amountPaidKobo: true,
          applicantFirstName: true,
          applicantLastName: true,
          guardianFirstName: true,
          guardianLastName: true,
          updatedAt: true,
          createdAt: true,
        },
      });

      const serializedApps = appPayments.map((app) => ({
        id: app.id,
        paymentReference: app.paymentReference || `APP-PAY-${app.id.slice(0, 8)}`,
        amountKobo: app.amountPaidKobo.toString(),
        paymentMethod: 'ONLINE_PAYMENT',
        status: 'CONFIRMED',
        paidAt: (app.updatedAt || app.createdAt).toISOString(),
        receipt: {
          id: app.id,
          receiptNumber: `REC-${app.applicationNumber}`,
          amountKobo: app.amountPaidKobo.toString(),
          issuedAt: (app.updatedAt || app.createdAt).toISOString(),
        },
        student: {
          firstName: app.applicantFirstName,
          lastName: app.applicantLastName,
          admissionNumber: app.applicationNumber,
        },
        payerGuardian: {
          firstName: app.guardianFirstName,
          lastName: app.guardianLastName,
        },
        invoice: {
          invoiceNumber: app.applicationNumber,
        },
        allocations: [],
        type: 'APPLICATION_FEE',
      }));

      combined = [...serialized, ...serializedApps].sort(
        (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()
      );
    }

    return NextResponse.json(combined);
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to retrieve payments.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
