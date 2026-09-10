import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AdmissionCycleStatus } from '@prisma/client';
import { getConfiguredApplicationFormFeeKobo } from '@/lib/admissions/fee_calculation';

/**
 * Public Admission Options API Endpoint
 * Returns open admission cycles, active programmes, and configured form fee.
 */
export async function GET() {
  try {
    const [cycles, programmes, formFeeKobo] = await Promise.all([
      prisma.admissionCycle.findMany({
        where: { status: AdmissionCycleStatus.OPEN },
        select: { id: true, name: true, code: true, startDate: true, endDate: true },
        take: 5,
      }),
      prisma.programme.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true, isMainAcademic: true, displayOrder: true },
        orderBy: { displayOrder: 'asc' },
      }),
      getConfiguredApplicationFormFeeKobo(prisma),
    ]);

    return NextResponse.json({
      cycles,
      programmes,
      formFeeKobo: formFeeKobo.toString(),
    });
  } catch {
    return NextResponse.json({ cycles: [], programmes: [], formFeeKobo: '500000' });
  }
}
