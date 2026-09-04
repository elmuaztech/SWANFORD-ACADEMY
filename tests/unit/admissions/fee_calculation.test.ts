import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { Gender, TermCode, ProgrammeCode, FeeApplicableGender, ApplicationChargeType } from '@prisma/client';
import {
  getConfiguredApplicationFormFeeKobo,
  calculateApplicationCharges,
} from '@/lib/admissions/fee_calculation';

describe('Stage 7 — Unit: Dynamic Fee Calculation & Financial Item Snapshot', () => {
  let sessionId: string;
  let termId: string;
  let primaryProgId: string;
  let tahfeezProgId: string;

  beforeEach(async () => {
    // 1. Setup session and first term
    const session = await prisma.academicSession.create({
      data: {
        name: `Fee-Test-Session-${Date.now()}`,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-07-31'),
        isCurrent: true,
      },
    });
    sessionId = session.id;

    const term = await prisma.academicTerm.create({
      data: {
        academicSessionId: session.id,
        termCode: TermCode.FIRST,
        name: 'First Term',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-12-15'),
        isCurrent: true,
      },
    });
    termId = term.id;

    const primaryProg = await prisma.programme.findUniqueOrThrow({
      where: { code: ProgrammeCode.PRIMARY },
    });
    primaryProgId = primaryProg.id;

    const tahfeezProg = await prisma.programme.findUniqueOrThrow({
      where: { code: ProgrammeCode.TAHFEEZ },
    });
    tahfeezProgId = tahfeezProg.id;

    // 2. Setup Fee Structures with itemized charges
    await prisma.feeStructure.create({
      data: {
        academicSessionId: sessionId,
        academicTermId: termId,
        programmeId: primaryProgId,
        applicableGender: FeeApplicableGender.MALE,
        isAdmissionFee: true,
        name: 'Primary Boys Admission Fee Structure',
        feeItems: {
          create: [
            { name: 'Tuition Fee', amountKobo: BigInt(7500000) }, // ₦75,000
            { name: 'Uniform & Cardigan', amountKobo: BigInt(2500000) }, // ₦25,000
          ],
        },
      },
    });

    await prisma.feeStructure.create({
      data: {
        academicSessionId: sessionId,
        academicTermId: termId,
        programmeId: tahfeezProgId,
        applicableGender: FeeApplicableGender.ALL,
        isAdmissionFee: true,
        name: 'Tahfeez Admission Fee Structure',
        feeItems: {
          create: [
            { name: 'Tahfeez Tuition', amountKobo: BigInt(1800000) }, // ₦18,000
          ],
        },
      },
    });
  });

  it('dynamically loads application form fee from SystemConfig (never hardcoded in logic)', async () => {
    // Ensure SystemConfig key exists
    await prisma.systemConfig.upsert({
      where: { key: 'admissions.form_fee_kobo' },
      update: { value: '650000' }, // ₦6,500
      create: {
        key: 'admissions.form_fee_kobo',
        value: '650000',
        category: 'ADMISSIONS',
        description: 'Testing dynamic fee',
      },
    });

    const fee = await getConfiguredApplicationFormFeeKobo();
    expect(fee).toBe(BigInt(650000));

    // Reset back to standard ₦5,000
    await prisma.systemConfig.update({
      where: { key: 'admissions.form_fee_kobo' },
      data: { value: '500000' },
    });
    const resetFee = await getConfiguredApplicationFormFeeKobo();
    expect(resetFee).toBe(BigInt(500000));
  });

  it('snapshots itemized charges for multi-programme applications with BigInt precision', async () => {
    const result = await calculateApplicationCharges({
      academicSessionId: sessionId,
      applicantGender: Gender.MALE,
      programmeSelections: [
        { programmeId: primaryProgId },
        { programmeId: tahfeezProgId },
      ],
    });

    // Form fee: 500,000 kobo (₦5,000)
    // Primary: 7,500,000 + 2,500,000 = 10,000,000 kobo (₦100,000)
    // Tahfeez: 1,800,000 kobo (₦18,000)
    // Total: 500,000 + 10,000,000 + 1,800,000 = 12,300,000 kobo (₦123,000)
    expect(result.formFeeKobo).toBe(BigInt(500000));
    expect(result.totalAmountKobo).toBe(BigInt(12300000));

    const formFeeItem = result.chargeItems.find(
      (c) => c.chargeType === ApplicationChargeType.APPLICATION_FORM_FEE
    );
    expect(formFeeItem).toBeDefined();
    expect(formFeeItem?.totalAmountKobo).toBe(BigInt(500000));

    const tuitionItems = result.chargeItems.filter(
      (c) => c.chargeType === ApplicationChargeType.PROGRAMME_TUITION
    );
    expect(tuitionItems).toHaveLength(2); // Primary tuition + Tahfeez tuition

    const uniformItem = result.chargeItems.find(
      (c) => c.chargeType === ApplicationChargeType.UNIFORM_CLOTHING
    );
    expect(uniformItem).toBeDefined();
    expect(uniformItem?.totalAmountKobo).toBe(BigInt(2500000));
  });
});
