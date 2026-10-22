import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { getParentChildFinance } from '@/lib/parent/parent_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { toUserFacingError } from '@/lib/ui/error_messages';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { id: studentId } = await params;
    const finance = await getParentChildFinance(user.id, studentId);

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, firstName: true, lastName: true, admissionNumber: true },
    });
    const childName = student ? `${student.firstName} ${student.lastName}`.trim() : 'Student';
    const admissionNumber = student?.admissionNumber || 'N/A';

    let totalBilled = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    for (const inv of finance) {
      totalBilled += Number(inv.totalAmountKobo || 0) / 100;
      totalPaid += Number(inv.amountPaidKobo || 0) / 100;
      totalOutstanding += Number(inv.outstandingBalanceKobo || 0) / 100;
    }

    const mappedInvoices = finance.map((inv) => ({
      ...inv,
      title: inv.billingPeriodName || `${inv.termName || 'Term'} Fee`,
      totalAmount: Number(inv.totalAmountKobo || 0) / 100,
      amountPaid: Number(inv.amountPaidKobo || 0) / 100,
      balance: Number(inv.outstandingBalanceKobo || 0) / 100,
      lineItems: (inv.items || []).map((it: any) => ({
        id: it.id,
        description: it.description,
        amount: Number(it.totalAmountKobo || 0) / 100,
      })),
      payments: (inv.payments || []).map((p: any) => ({
        id: p.id,
        reference: p.paymentReference,
        amount: Number(p.amountKobo || 0) / 100,
        paymentMethod: p.paymentMethod,
        paidAt: p.paidAt,
      })),
      receipts: (inv.payments || [])
        .filter((p: any) => p.receipt)
        .map((p: any) => ({
          id: p.receipt.id,
          receiptNumber: p.receipt.receiptNumber,
          amount: Number(p.receipt.amountKobo || p.amountKobo || 0) / 100,
          issuedAt: p.receipt.issuedAt || p.paidAt,
        })),
    }));

    return NextResponse.json({
      child: {
        id: studentId,
        name: childName,
        admissionNumber,
      },
      totals: {
        totalBilled,
        totalPaid,
        totalOutstanding,
      },
      invoices: mappedInvoices,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const err = toUserFacingError(error);
    return NextResponse.json({ error: err.message, title: err.title }, { status: 500 });
  }
}
