import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AdmissionCycleStatus } from '@prisma/client';

export async function GET() {
  try {
    const [cycles, programmes] = await Promise.all([
      prisma.admissionCycle.findMany({
        where: { status: AdmissionCycleStatus.OPEN },
        select: { id: true, name: true },
        take: 5,
      }),
      prisma.programme.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return NextResponse.json({ cycles, programmes });
  } catch {
    return NextResponse.json({ cycles: [], programmes: [] });
  }
}
