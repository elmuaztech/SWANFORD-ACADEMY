import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AdmissionCycleStatus } from '@prisma/client';
import { getConfiguredApplicationFormFeeKobo } from '@/lib/admissions/fee_calculation';

export const dynamic = 'force-dynamic';

/**
 * Public Admission Options API Endpoint
 * Returns dynamic active session, open/closed status, announcement, cycles, programmes, and form fee.
 * ZERO HARDCODED SESSIONS.
 */
export async function GET() {
  try {
    const activeSession = await prisma.academicSession.findFirst({
      where: { isCurrent: true },
      select: { id: true, name: true },
    });

    const [cycles, programmes, formFeeKobo] = await Promise.all([
      activeSession
        ? prisma.admissionCycle.findMany({
            where: {
              academicSessionId: activeSession.id,
              status: AdmissionCycleStatus.OPEN,
            },
            select: { id: true, name: true, code: true, startDate: true, endDate: true },
            take: 5,
          })
        : Promise.resolve([]),
      prisma.programme.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true, isMainAcademic: true, displayOrder: true },
        orderBy: { displayOrder: 'asc' },
      }),
      getConfiguredApplicationFormFeeKobo(prisma),
    ]);

    const activeSessionName = activeSession?.name || '';
    const isOpen = Boolean(activeSession && cycles.length > 0);
    const announcement = !activeSessionName
      ? 'Admissions are currently closed.'
      : isOpen
        ? `Admissions for ${activeSessionName} are now open.`
        : `Admissions for ${activeSessionName} are currently closed.`;

    return NextResponse.json({
      isOpen,
      activeSessionName: activeSessionName || 'Upcoming Session',
      activeSessionId: activeSession?.id || null,
      announcement,
      cycles,
      programmes,
      formFeeKobo: formFeeKobo.toString(),
    });
  } catch {
    return NextResponse.json({
      isOpen: false,
      activeSessionName: 'Upcoming Session',
      activeSessionId: null,
      announcement: 'Admissions are currently closed.',
      cycles: [],
      programmes: [],
      formFeeKobo: '500000',
    });
  }
}
