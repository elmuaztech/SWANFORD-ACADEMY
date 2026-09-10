import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { getFeeCollectionSummary } from '@/lib/finance/report_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    let sessionId = searchParams.get('sessionId') || undefined;
    const termId = searchParams.get('termId') || undefined;
    const programmeId = searchParams.get('programmeId') || undefined;

    if (!sessionId) {
      const currentSession = await prisma.academicSession.findFirst({
        where: { isCurrent: true },
        select: { id: true },
      });
      sessionId = currentSession?.id;
    }

    if (!sessionId) {
      return NextResponse.json({
        totalInvoicedKobo: '0',
        totalCollectedKobo: '0',
        totalOutstandingKobo: '0',
        collectionRatePercentage: 0,
        invoiceCounts: { total: 0, fullyPaid: 0, partiallyPaid: 0, unpaid: 0, cancelled: 0 },
      });
    }

    const summary = await getFeeCollectionSummary(actor, {
      academicSessionId: sessionId,
      academicTermId: termId,
      programmeId,
    });

    return NextResponse.json({
      ...summary,
      totalInvoicedKobo: summary.totalInvoicedKobo.toString(),
      totalCollectedKobo: summary.totalCollectedKobo.toString(),
      totalOutstandingKobo: summary.totalOutstandingKobo.toString(),
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to retrieve financial summary.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
