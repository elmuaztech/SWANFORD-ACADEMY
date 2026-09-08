import { describe, it, expect } from 'vitest';
import { CreateFeeStructureSchema, FeeItemInputSchema } from '@/lib/finance/fee_structure_service';
import { FeeApplicableGender } from '@prisma/client';

describe('Stage 8 — Unit: Fee Structure Validation Schemas', () => {
  it('validates correct fee item schema', () => {
    const valid = FeeItemInputSchema.parse({
      name: 'Tuition Fee',
      amountKobo: '5000000',
    });
    expect(valid.name).toBe('Tuition Fee');
    expect(valid.amountKobo).toBe('5000000');
  });

  it('rejects fee item with negative kobo', () => {
    expect(() =>
      FeeItemInputSchema.parse({
        name: 'Invalid Item',
        amountKobo: '-1000',
      })
    ).toThrow();
  });

  it('validates full CreateFeeStructureSchema input', () => {
    const valid = CreateFeeStructureSchema.parse({
      academicSessionId: 'a0000000-0000-4000-8000-000000000001',
      academicTermId: 'a0000000-0000-4000-8000-000000000002',
      programmeId: 'a0000000-0000-4000-8000-000000000003',
      applicableGender: FeeApplicableGender.MALE,
      isAdmissionFee: true,
      name: 'Primary 1st Term Boys Admission Fee',
      feeItems: [
        { name: 'Tuition', amountKobo: 4500000 },
        { name: 'Cardigan', amountKobo: 1200000 },
      ],
    });

    expect(valid.name).toBe('Primary 1st Term Boys Admission Fee');
    expect(valid.feeItems).toHaveLength(2);
  });

  it('rejects CreateFeeStructureSchema with empty fee items', () => {
    expect(() =>
      CreateFeeStructureSchema.parse({
        academicSessionId: 'a0000000-0000-4000-8000-000000000001',
        academicTermId: 'a0000000-0000-4000-8000-000000000002',
        programmeId: 'a0000000-0000-4000-8000-000000000003',
        name: 'Empty Fee Structure',
        feeItems: [],
      })
    ).toThrow();
  });
});
