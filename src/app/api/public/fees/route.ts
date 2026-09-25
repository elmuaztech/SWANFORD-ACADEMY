import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getConfiguredApplicationFormFeeKobo } from '@/lib/admissions/fee_calculation';

/**
 * Swanford Academy — Authoritative Public Fee Schedule Endpoint
 * Master Specification Reference: Work Package D (Fees Page & Dynamic Financial Retrieval)
 *
 * Dynamically queries active PostgreSQL fee structures and configured form fee.
 * Zero hardcoded financial amounts.
 */
export async function GET() {
  try {
    // 1. Fetch current active academic session
    const currentSession = await prisma.academicSession.findFirst({
      where: { isCurrent: true },
      include: {
        terms: {
          orderBy: { termCode: 'asc' },
        },
      },
    });

    const sessionId = currentSession?.id;

    // 2. Fetch configured application form fee from SystemConfig
    const formFeeKobo = await getConfiguredApplicationFormFeeKobo(prisma);

    // 3. Fetch all active fee structures for the session
    const feeStructures = await prisma.feeStructure.findMany({
      where: sessionId ? { academicSessionId: sessionId } : {},
      include: {
        programme: {
          select: { id: true, name: true, code: true },
        },
        academicTerm: {
          select: { id: true, name: true, termCode: true },
        },
        feeItems: {
          orderBy: { amountKobo: 'desc' },
        },
      },
      orderBy: [
        { programme: { displayOrder: 'asc' } },
        { academicTerm: { termCode: 'asc' } },
      ],
    });

    // 4. Fetch bank account details from SystemConfig
    const bankConfigs = await prisma.systemConfig.findMany({
      where: {
        key: {
          in: ['finance.bank_name', 'finance.account_number', 'finance.account_name'],
        },
      },
    });

    const bankMap = new Map(bankConfigs.map((c) => [c.key, c.value]));

    const bankDetails = {
      bankName: bankMap.get('finance.bank_name') || '',
      accountNumber: bankMap.get('finance.account_number') || '',
      accountName: bankMap.get('finance.account_name') || 'Swanford Academy',
    };

    return NextResponse.json({
      session: currentSession
        ? { id: currentSession.id, name: currentSession.name }
        : null,
      formFeeKobo: formFeeKobo.toString(),
      bankDetails,
      feeStructures: feeStructures.map((fs) => ({
        id: fs.id,
        name: fs.name,
        programmeName: fs.programme.name,
        programmeCode: fs.programme.code,
        termName: fs.academicTerm.name,
        termCode: fs.academicTerm.termCode,
        applicableGender: fs.applicableGender,
        isAdmissionFee: fs.isAdmissionFee,
        totalAmountKobo: fs.feeItems
          .reduce((sum, item) => sum + item.amountKobo, BigInt(0))
          .toString(),
        items: fs.feeItems.map((item) => ({
          name: item.name,
          amountKobo: item.amountKobo.toString(),
        })),
      })),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unable to retrieve fee structures';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
