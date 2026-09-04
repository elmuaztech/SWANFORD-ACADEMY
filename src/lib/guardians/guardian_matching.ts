import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Swanford Academy — Conservative Guardian Matching Engine
 * Master Specification Reference: Sections 7, 8, 9
 *
 * Principles:
 * - Primary Match: Verified, normalized email.
 * - Strict Non-Merge: Never merge two guardians solely because of:
 *   - Same name
 *   - Same phone number
 *   - Similar spelling
 *   - Same residential address
 * - Name and phone are supporting attributes, NEVER sufficient for automatic merge.
 * - If conflicting identity info exists, raise a review state; do not silently merge.
 */

export interface GuardianMatchInput {
  firstName: string;
  lastName: string;
  email?: string | null;
  phonePrimary?: string | null;
}

export interface GuardianMatchResult {
  matchedGuardianId: string | null;
  matchType: 'EXACT_EMAIL_MATCH' | 'NONE';
  hasConflict: boolean;
  conflictReason?: string;
}

export async function matchExistingGuardian(
  input: GuardianMatchInput,
  tx: Prisma.TransactionClient = prisma
): Promise<GuardianMatchResult> {
  const normalizedEmail = input.email?.trim().toLowerCase() || null;
  const normalizedPhone = input.phonePrimary?.trim() || null;
  const normalizedFirstName = input.firstName.trim();
  const normalizedLastName = input.lastName.trim();

  // 1. PRIMARY MATCH: Normalized Email
  if (normalizedEmail) {
    const existingByEmail = await tx.guardian.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingByEmail) {
      // Check for identity discrepancy warning (e.g. email belongs to "Ibrahim Sani" but input is "Maryam Usman")
      const existingName = `${existingByEmail.firstName} ${existingByEmail.lastName}`.toLowerCase();
      const inputName = `${normalizedFirstName} ${normalizedLastName}`.toLowerCase();

      if (existingName !== inputName) {
        // Legitimate shared family email (e.g. family email used by father and mother) or identity mismatch
        return {
          matchedGuardianId: existingByEmail.id,
          matchType: 'EXACT_EMAIL_MATCH',
          hasConflict: true,
          conflictReason: `Guardian with email ${normalizedEmail} exists with different name (${existingByEmail.firstName} ${existingByEmail.lastName} vs ${input.firstName} ${input.lastName}).`,
        };
      }

      return {
        matchedGuardianId: existingByEmail.id,
        matchType: 'EXACT_EMAIL_MATCH',
        hasConflict: false,
      };
    }
  }

  // 2. CONFLICT CHECK: Same phone or name with different/absent email MUST NOT AUTO-MERGE
  if (normalizedPhone) {
    const existingByPhone = await tx.guardian.findFirst({
      where: { phonePrimary: normalizedPhone },
    });

    if (existingByPhone) {
      // Different guardian sharing a phone or same guardian without email match
      // Strict Invariant: DO NOT AUTOMATICALLY MERGE!
      return {
        matchedGuardianId: null,
        matchType: 'NONE',
        hasConflict: true,
        conflictReason: `Another guardian record exists with the same primary phone (${normalizedPhone}) for ${existingByPhone.firstName} ${existingByPhone.lastName}. Auto-merge rejected.`,
      };
    }
  }

  // 3. Name-only match MUST NOT AUTO-MERGE
  const existingByName = await tx.guardian.findFirst({
    where: {
      firstName: { equals: normalizedFirstName, mode: 'insensitive' },
      lastName: { equals: normalizedLastName, mode: 'insensitive' },
    },
  });

  if (existingByName) {
    return {
      matchedGuardianId: null,
      matchType: 'NONE',
      hasConflict: true,
      conflictReason: `A guardian with name ${input.firstName} ${input.lastName} already exists. Name matching alone is not sufficient for auto-merge.`,
    };
  }

  return {
    matchedGuardianId: null,
    matchType: 'NONE',
    hasConflict: false,
  };
}
