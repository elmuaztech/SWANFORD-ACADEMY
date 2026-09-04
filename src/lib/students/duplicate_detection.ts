import { Prisma, StudentStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Swanford Academy — Duplicate Student Detection Service
 * Master Specification Reference: Sections 7, 8
 *
 * Invariants:
 * - WARNING ONLY: Never automatically merge students.
 * - Same name + same date of birth can occur (e.g. twins, common names in Dutse).
 * - Surfaces warnings/advisories to administrative staff.
 * - Admission number remains the definitive school identifier.
 */

export interface PotentialStudentMatch {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  otherNames: string | null;
  dateOfBirth: Date;
  currentStatus: StudentStatus;
}

export interface DuplicateDetectionResult {
  hasPotentialDuplicates: boolean;
  warnings: string[];
  matchedStudents: PotentialStudentMatch[];
}

export async function detectPotentialStudentDuplicates(
  input: {
    firstName: string;
    lastName: string;
    dateOfBirth: Date | string;
  },
  tx: Prisma.TransactionClient = prisma
): Promise<DuplicateDetectionResult> {
  const normalizedFirstName = input.firstName.trim();
  const normalizedLastName = input.lastName.trim();
  const dob = typeof input.dateOfBirth === 'string' ? new Date(input.dateOfBirth) : input.dateOfBirth;

  // Exact match on First Name, Last Name (case-insensitive) and Date of Birth
  const matched = await tx.student.findMany({
    where: {
      firstName: { equals: normalizedFirstName, mode: 'insensitive' },
      lastName: { equals: normalizedLastName, mode: 'insensitive' },
      dateOfBirth: dob,
    },
    select: {
      id: true,
      admissionNumber: true,
      firstName: true,
      lastName: true,
      otherNames: true,
      dateOfBirth: true,
      currentStatus: true,
    },
  });

  if (matched.length === 0) {
    return {
      hasPotentialDuplicates: false,
      warnings: [],
      matchedStudents: [],
    };
  }

  const warnings = matched.map(
    (m) =>
      `Potential duplicate match: Existing student ${m.firstName} ${m.lastName} ` +
      `(Admission No: ${m.admissionNumber}, Status: ${m.currentStatus}) shares the same date of birth (${dob.toISOString().split('T')[0]}). ` +
      `Review carefully before proceeding.`
  );

  return {
    hasPotentialDuplicates: true,
    warnings,
    matchedStudents: matched,
  };
}
