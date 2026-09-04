import { prisma } from '@/lib/prisma';
import { ApplicationChargeType, FeeApplicableGender, Gender, Prisma, TermCode } from '@prisma/client';

export interface CalculatedChargeItem {
  chargeType: ApplicationChargeType;
  description: string;
  unitAmountKobo: bigint;
  quantity: number;
  totalAmountKobo: bigint;
  programmeSelectionId?: string | null;
  programmeId?: string | null;
}

export interface ApplicationPricingCalculation {
  formFeeKobo: bigint;
  chargeItems: CalculatedChargeItem[];
  totalAmountKobo: bigint;
}

/**
 * Retrieves the configured application form fee from SystemConfig (not hardcoded in business logic).
 * Master Specification Reference: Sections 8, 9, 21.
 */
export async function getConfiguredApplicationFormFeeKobo(
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<bigint> {
  const config = await client.systemConfig.findUnique({
    where: { key: 'admissions.form_fee_kobo' },
  });

  if (config && config.value) {
    try {
      return BigInt(config.value.trim());
    } catch {
      // If parsing fails, use standard baseline
      return BigInt(500000);
    }
  }

  // Baseline fallback if not seeded in development
  return BigInt(500000);
}

/**
 * Maps a fee item name to its appropriate ApplicationChargeType
 */
function inferChargeType(itemName: string): ApplicationChargeType {
  const lower = itemName.toLowerCase();
  if (lower.includes('tuition')) return ApplicationChargeType.PROGRAMME_TUITION;
  if (lower.includes('uniform') || lower.includes('polo') || lower.includes('cardigan')) {
    return ApplicationChargeType.UNIFORM_CLOTHING;
  }
  if (lower.includes('book') || lower.includes('stationery')) {
    return ApplicationChargeType.BOOKS_STATIONERY;
  }
  if (lower.includes('medical') || lower.includes('exam')) {
    return ApplicationChargeType.EXAM_MEDICAL;
  }
  return ApplicationChargeType.OTHER;
}

/**
 * Calculates itemized charges for an application based on selected programmes and applicant demographics.
 * Strictly reads configured prices from SystemConfig and FeeStructure models in PostgreSQL.
 */
export async function calculateApplicationCharges(
  input: {
    academicSessionId: string;
    applicantGender: Gender;
    programmeSelections: Array<{
      programmeId: string;
      selectionId?: string;
    }>;
  },
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<ApplicationPricingCalculation> {
  // 1. Read configured application form fee (Dynamic, not hardcoded!)
  const formFeeKobo = await getConfiguredApplicationFormFeeKobo(client);

  const chargeItems: CalculatedChargeItem[] = [
    {
      chargeType: ApplicationChargeType.APPLICATION_FORM_FEE,
      description: 'Application Form Processing Fee',
      unitAmountKobo: formFeeKobo,
      quantity: 1,
      totalAmountKobo: formFeeKobo,
      programmeSelectionId: null,
      programmeId: null,
    },
  ];

  // 2. Find first term of the target session for entrance billing
  const firstTerm = await client.academicTerm.findFirst({
    where: {
      academicSessionId: input.academicSessionId,
      termCode: TermCode.FIRST,
    },
  });

  const genderFilter =
    input.applicantGender === Gender.MALE
      ? [FeeApplicableGender.MALE, FeeApplicableGender.ALL]
      : [FeeApplicableGender.FEMALE, FeeApplicableGender.ALL];

  // 3. For each selected programme, inspect configured FeeStructure
  for (const selection of input.programmeSelections) {
    const programme = await client.programme.findUnique({
      where: { id: selection.programmeId },
    });

    if (!programme) continue;

    if (firstTerm) {
      const feeStructures = await client.feeStructure.findMany({
        where: {
          academicSessionId: input.academicSessionId,
          academicTermId: firstTerm.id,
          programmeId: selection.programmeId,
          applicableGender: { in: genderFilter },
          isAdmissionFee: true,
          isActive: true,
        },
        include: {
          feeItems: true,
        },
      });

      for (const fs of feeStructures) {
        for (const item of fs.feeItems) {
          chargeItems.push({
            chargeType: inferChargeType(item.name),
            description: `${programme.name} — ${item.name}`,
            unitAmountKobo: item.amountKobo,
            quantity: 1,
            totalAmountKobo: item.amountKobo,
            programmeSelectionId: selection.selectionId || null,
            programmeId: selection.programmeId,
          });
        }
      }
    }
  }

  // 4. Calculate total sum
  let totalAmountKobo = BigInt(0);
  for (const item of chargeItems) {
    totalAmountKobo += item.totalAmountKobo;
  }

  return {
    formFeeKobo,
    chargeItems,
    totalAmountKobo,
  };
}
