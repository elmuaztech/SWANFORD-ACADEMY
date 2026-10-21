import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import {
  listInvoices,
  createInvoice,
  generateBatchTermInvoices,
  CreateInvoiceSchema,
  BatchInvoiceGenerationSchema,
} from '@/lib/finance/invoice_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { InvoiceStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';

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

export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();
    const mode = body.mode || 'SINGLE'; // 'SINGLE' | 'BATCH' | 'CRECHE_MONTHLY'

    if (mode === 'CRECHE_MONTHLY' || mode === 'BATCH') {
      let programmeId = body.programmeId;
      if (mode === 'CRECHE_MONTHLY' && !programmeId) {
        const creche = await prisma.programme.findFirst({ where: { code: 'CRECHE' } });
        if (!creche) throw new AuthorizationError('Creche programme not found in system.', 404, 'CRECHE_NOT_FOUND');
        programmeId = creche.id;
      }

      const validated = BatchInvoiceGenerationSchema.parse({
        ...body,
        programmeId,
        billingMonth: body.billingMonth !== undefined ? Number(body.billingMonth) : 0,
        billingPeriodName: body.billingPeriodName || undefined,
        dueDate: body.dueDate || new Date(Date.now() + 14 * 86400000),
      });

      const result = await generateBatchTermInvoices(actor, validated);
      return NextResponse.json({
        success: true,
        message: `Generated ${result.createdCount} invoice(s). Skipped ${result.skippedExistingCount} already billed.`,
        ...result,
      });
    }

    // Single invoice creation
    const validated = CreateInvoiceSchema.parse(body);
    const invoice = await createInvoice(actor, validated);

    return NextResponse.json({
      success: true,
      invoice: {
        ...invoice,
        totalAmountKobo: invoice.totalAmountKobo.toString(),
        amountPaidKobo: invoice.amountPaidKobo.toString(),
        outstandingBalanceKobo: invoice.outstandingBalanceKobo.toString(),
        items: invoice.items.map((item) => ({
          ...item,
          unitAmountKobo: item.unitAmountKobo.toString(),
          totalAmountKobo: item.totalAmountKobo.toString(),
        })),
      },
    }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to generate invoice(s).';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
