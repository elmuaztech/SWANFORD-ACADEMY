import { prisma } from '@/lib/prisma';
import {
  Gender,
  RelationshipType,
  EnrollmentType,
  EnrollmentStatus,
  UserStatus,
  VerificationTokenType,
  ImportBatchStatus,
  ImportRowStatus,
  RoleCode,
} from '@prisma/client';
import { reserveAdmissionNumberBlock } from './admission_number';
import { createUnactivatedPasswordSentinel } from '@/lib/auth/password';
import { generateSecureToken } from '@/lib/auth/tokens';
import { enqueueNotification } from '@/lib/notifications/outbox';
import { NotificationCategory } from '@/lib/notifications/types';
import { renderAccountActivationEmail } from '@/lib/notifications/templates';

/**
 * Swanford Academy — Bulk Student Enrollment Service
 *
 * Core Principles:
 * - Validate first, commit second.
 * - Per-row atomic transaction isolation (controlled partial success).
 * - Gaps permitted in reserved admission numbers.
 * - Student unpolluted: traceability maintained via StudentImportRow.studentId.
 * - Sibling guardian matching via email.
 * - Never email passwords; creates one-time activation token and outbox notification.
 * - Database enrollment NEVER depends on external email delivery.
 */

import { parseFullName } from '@/lib/utils/name_parser';

export interface BulkStudentRowInput {
  rowNumber: number;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  otherNames?: string;
  gender: 'MALE' | 'FEMALE';
  dateOfBirth: string; // YYYY-MM-DD
  schoolClassId: string;
  programmeIds: string[]; // Multi-programme support
  guardianFullName?: string;
  guardianFirstName?: string;
  guardianLastName?: string;
  guardianEmail?: string;
  guardianPhone: string;
  relationshipType?: 'FATHER' | 'MOTHER' | 'LEGAL_GUARDIAN' | 'SPONSOR';
  residentialAddress?: string;
  profilePhotoId?: string | null;
}

export interface BulkEnrollmentBatchInput {
  academicSessionId: string;
  academicTermId: string;
  sourceType?: 'MANUAL_BULK_ENTRY' | 'CSV_IMPORT';
  notes?: string;
  rows: BulkStudentRowInput[];
}

export interface BulkEnrollmentResult {
  batchId: string;
  batchNumber: string;
  totalSubmitted: number;
  totalSuccessful: number;
  totalFailed: number;
  status: ImportBatchStatus;
  successfulStudents: {
    rowNumber: number;
    studentId: string;
    admissionNumber: string;
    studentName: string;
  }[];
  failedRows: {
    rowNumber: number;
    errorMessage: string;
  }[];
}

/**
 * Generates an audit-compliant batch number: BATCH-YYYY-NNNNN
 */
export async function generateBatchNumber(year: number = new Date().getFullYear()): Promise<string> {
  const count = await prisma.studentImportBatch.count();
  const sequence = (count + 1).toString().padStart(5, '0');
  return `BATCH-${year}-${sequence}`;
}

/**
 * Validates a single student row payload
 */
export function validateRowPayload(row: BulkStudentRowInput): { valid: boolean; error?: string } {
  // Normalize pupil full name
  if (row.fullName?.trim()) {
    const parsed = parseFullName(row.fullName);
    row.firstName = parsed.firstName;
    row.lastName = parsed.lastName;
    if (parsed.otherNames && !row.otherNames) {
      row.otherNames = parsed.otherNames;
    }
  }

  // Normalize guardian full name
  if (row.guardianFullName?.trim()) {
    const parsed = parseFullName(row.guardianFullName);
    row.guardianFirstName = parsed.firstName;
    row.guardianLastName = parsed.lastName;
  }

  if (!row.firstName?.trim()) return { valid: false, error: 'Student full name is required' };
  if (!row.lastName?.trim()) return { valid: false, error: 'Student surname / full name is required' };
  if (!row.gender || !['MALE', 'FEMALE'].includes(row.gender)) {
    return { valid: false, error: 'Valid gender (MALE or FEMALE) is required' };
  }

  // Resilient Date of Birth parsing (supports YYYY-MM-DD and DD/MM/YYYY)
  let dob = new Date(row.dateOfBirth);
  if (isNaN(dob.getTime())) {
    const dmyMatch = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec((row.dateOfBirth || '').trim());
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10);
      const year = parseInt(dmyMatch[3], 10);
      const iso = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      dob = new Date(iso);
      if (!isNaN(dob.getTime())) {
        row.dateOfBirth = iso;
      }
    }
  } else {
    const isoMatch = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec((row.dateOfBirth || '').trim());
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10);
      const day = parseInt(isoMatch[3], 10);
      row.dateOfBirth = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
  }

  if (isNaN(dob.getTime())) {
    return { valid: false, error: 'Invalid date of birth format' };
  }

  if (dob >= new Date()) {
    return { valid: false, error: 'Date of birth must be in the past' };
  }

  if (row.relationshipType && !['FATHER', 'MOTHER', 'LEGAL_GUARDIAN', 'SPONSOR'].includes(row.relationshipType)) {
    return { valid: false, error: 'Invalid parent relationship type' };
  }

  if (!row.schoolClassId?.trim()) return { valid: false, error: 'School class ID is required' };
  if (!row.programmeIds || row.programmeIds.length === 0) {
    return { valid: false, error: 'At least one programme must be selected' };
  }

  if (!row.guardianFirstName?.trim() || !row.guardianLastName?.trim()) {
    return { valid: false, error: 'Guardian full name is required' };
  }
  if (!row.guardianPhone?.trim()) return { valid: false, error: 'Guardian phone is required' };

  if (row.guardianEmail?.trim()) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(row.guardianEmail.trim())) {
      return { valid: false, error: 'Invalid guardian email format' };
    }
  }

  return { valid: true };
}

/**
 * Executes bulk student enrollment with per-row atomic transaction isolation.
 */
export async function executeBulkStudentEnrollment(
  input: BulkEnrollmentBatchInput,
  createdById?: string
): Promise<BulkEnrollmentResult> {
  if (!input.rows || input.rows.length === 0) {
    throw new Error('No student rows provided for bulk enrollment');
  }

  const year = new Date().getFullYear();
  const batchNumber = await generateBatchNumber(year);

  // Verify session and term exist
  const session = await prisma.academicSession.findUnique({
    where: { id: input.academicSessionId },
  });
  if (!session) {
    throw new Error(`Academic session ${input.academicSessionId} not found`);
  }

  const term = await prisma.academicTerm.findUnique({
    where: { id: input.academicTermId },
  });
  if (!term || term.academicSessionId !== session.id) {
    throw new Error(`Academic term ${input.academicTermId} is invalid for session ${session.id}`);
  }

  // 1. Create the persistent Import Batch in PROCESSING state
  const batch = await prisma.studentImportBatch.create({
    data: {
      batchNumber,
      createdById,
      academicSessionId: session.id,
      totalSubmitted: input.rows.length,
      totalSuccessful: 0,
      totalFailed: 0,
      status: ImportBatchStatus.PROCESSING,
      sourceType: input.sourceType || 'MANUAL_BULK_ENTRY',
      notes: input.notes,
    },
  });

  // 2. Atomically reserve a block of admission numbers
  const admissionNumbers = await reserveAdmissionNumberBlock(input.rows.length, year);

  const successfulStudents: BulkEnrollmentResult['successfulStudents'] = [];
  const failedRows: BulkEnrollmentResult['failedRows'] = [];

  // 3. Process each row in an isolated transaction
  for (let i = 0; i < input.rows.length; i++) {
    const row = input.rows[i];
    const assignedAdmissionNumber = admissionNumbers[i];

    // Pre-validate row payload
    const validation = validateRowPayload(row);
    if (!validation.valid) {
      failedRows.push({ rowNumber: row.rowNumber, errorMessage: validation.error! });

      await prisma.studentImportRow.create({
        data: {
          batchId: batch.id,
          rowNumber: row.rowNumber,
          status: ImportRowStatus.FAILED,
          rawDataJson: row as unknown as object,
          errorMessage: validation.error,
        },
      });
      continue;
    }

    try {
      // Execute row creation in an atomic transaction
      const createdStudent = await prisma.$transaction(async (tx) => {
        // Step A: Verify class and programmes
        const schoolClass = await tx.schoolClass.findUnique({
          where: { id: row.schoolClassId },
        });
        if (!schoolClass) {
          throw new Error(`School class ${row.schoolClassId} does not exist`);
        }

        const programmes = await tx.programme.findMany({
          where: { id: { in: row.programmeIds } },
        });
        if (programmes.length !== row.programmeIds.length) {
          throw new Error('One or more selected programmes do not exist');
        }

        const studentParsed = parseFullName(row.fullName || `${row.firstName || ''} ${row.lastName || ''}`);
        const studentFirstName = studentParsed.firstName || (row.firstName || '').trim();
        const studentLastName = studentParsed.lastName || (row.lastName || '').trim();
        const studentOtherNames = studentParsed.otherNames || row.otherNames?.trim() || null;

        const guardianParsed = parseFullName(row.guardianFullName || `${row.guardianFirstName || ''} ${row.guardianLastName || ''}`);
        const guardianFirstName = guardianParsed.firstName || (row.guardianFirstName || '').trim();
        const guardianLastName = guardianParsed.lastName || (row.guardianLastName || '').trim();

        // Step B: Create Student with passport photo and parent emergency contact details
        const student = await tx.student.create({
          data: {
            admissionNumber: assignedAdmissionNumber,
            firstName: studentFirstName,
            lastName: studentLastName,
            otherNames: studentOtherNames,
            gender: row.gender as Gender,
            dateOfBirth: new Date(row.dateOfBirth),
            profilePhotoId: row.profilePhotoId?.trim() || null,
            emergencyContactName: `${guardianFirstName} ${guardianLastName}`.trim(),
            emergencyContactPhone: row.guardianPhone.trim(),
            emergencyContactRelationship: (row.relationshipType as string) || 'PARENT',
          },
        });

        // Step C: Match or Create Guardian
        let guardianId: string;
        let guardianUserId: string | null = null;
        const normalizedEmail = row.guardianEmail?.trim().toLowerCase() || null;
        const normalizedPhone = row.guardianPhone.trim();

        if (normalizedEmail) {
          const existingGuardian = await tx.guardian.findUnique({
            where: { email: normalizedEmail },
          });

          if (existingGuardian) {
            guardianId = existingGuardian.id;
            guardianUserId = existingGuardian.userId;
            if (!existingGuardian.phonePrimary && normalizedPhone) {
              await tx.guardian.update({
                where: { id: existingGuardian.id },
                data: { phonePrimary: normalizedPhone },
              });
            }
          } else {
            const newGuardian = await tx.guardian.create({
              data: {
                firstName: guardianFirstName,
                lastName: guardianLastName,
                email: normalizedEmail,
                phonePrimary: normalizedPhone,
                residentialAddress: row.residentialAddress?.trim() || null,
              },
            });
            guardianId = newGuardian.id;
          }
        } else {
          // Parent without email: check if existing guardian exists by phone
          const existingGuardian = await tx.guardian.findFirst({
            where: { phonePrimary: normalizedPhone },
          });

          if (existingGuardian) {
            guardianId = existingGuardian.id;
            guardianUserId = existingGuardian.userId;
          } else {
            const newGuardian = await tx.guardian.create({
              data: {
                firstName: guardianFirstName,
                lastName: guardianLastName,
                email: null,
                phonePrimary: normalizedPhone,
                residentialAddress: row.residentialAddress?.trim() || null,
              },
            });
            guardianId = newGuardian.id;
          }
        }

        // Step D: Create GuardianStudentRelationship
        const existingRel = await tx.guardianStudentRelationship.findUnique({
          where: {
            guardianId_studentId: {
              guardianId,
              studentId: student.id,
            },
          },
        });

        if (!existingRel) {
          await tx.guardianStudentRelationship.create({
            data: {
              guardianId,
              studentId: student.id,
              relationshipType: (row.relationshipType as RelationshipType) || RelationshipType.LEGAL_GUARDIAN,
              isPrimaryContact: true,
              canPickup: true,
              receivesInvoices: true,
            },
          });
        }

        // Step E: Create StudentProgrammeEnrollment for each programme
        for (const prog of programmes) {
          await tx.studentProgrammeEnrollment.create({
            data: {
              studentId: student.id,
              programmeId: prog.id,
              schoolClassId: schoolClass.id,
              academicSessionId: session.id,
              academicTermId: term.id,
              enrollmentType: prog.isMainAcademic ? EnrollmentType.MAIN_ACADEMIC : EnrollmentType.ADDITIONAL_PROGRAMME,
              enrollmentStatus: EnrollmentStatus.ACTIVE,
            },
          });
        }

        // Step F: Parent Account Lifecycle (email is mandatory)
        if (normalizedEmail) {
          const parentRole = await tx.role.findUnique({
            where: { code: RoleCode.PARENT },
          });

          // Check if a User already exists with this email
          let user = await tx.user.findUnique({ where: { email: normalizedEmail } });
          if (!user) {
            let userPhone = row.guardianPhone?.trim() || null;
            if (userPhone) {
              const existingPhoneUser = await tx.user.findUnique({
                where: { phoneNumber: userPhone },
              });
              if (existingPhoneUser) {
                userPhone = null;
              }
            }

            const sentinelPassword = createUnactivatedPasswordSentinel();
            user = await tx.user.create({
              data: {
                email: normalizedEmail,
                phoneNumber: userPhone,
                firstName: guardianFirstName,
                lastName: guardianLastName,
                passwordHash: sentinelPassword,
                status: UserStatus.PENDING_VERIFICATION,
                mustChangePassword: true,
                userRoles: parentRole ? {
                  create: [{ roleId: parentRole.id }],
                } : undefined,
              },
            });

            // Link Guardian to User
            await tx.guardian.update({
              where: { id: guardianId },
              data: { userId: user.id },
            });

            // Generate one-time ACCOUNT_ACTIVATION token (7-day expiry)
            const { rawToken, tokenHash } = generateSecureToken();
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

            await tx.emailVerification.create({
              data: {
                userId: user.id,
                tokenHash,
                email: normalizedEmail,
                tokenType: VerificationTokenType.ACCOUNT_ACTIVATION,
                expiresAt,
              },
            });

            // Step G: Persistent Outbox Notification
            const activationUrl = `/auth/activate?token=${rawToken}`;
            const rendered = renderAccountActivationEmail({
              recipientName: `${row.guardianFirstName} ${row.guardianLastName}`.trim(),
              activationUrl,
              expiresInHours: 72,
            });

            await enqueueNotification(
              {
                idempotencyKey: `SECURITY:ACCOUNT_ACTIVATION:${user.id}:${tokenHash}`,
                recipientUserId: user.id,
                recipientEmail: normalizedEmail,
                channel: 'EMAIL',
                category: NotificationCategory.SECURITY,
                templateName: 'PARENT_WELCOME_ACTIVATION',
                subject: rendered.subject,
                bodyText: rendered.text,
                htmlBody: rendered.html,
                metadata: { tokenHash, expiresAt: expiresAt.toISOString(), studentId: student.id },
              },
              tx
            );
          } else {
            // User already exists: ensure guardian is linked and PARENT role is assigned
            if (!guardianUserId) {
              await tx.guardian.update({
                where: { id: guardianId },
                data: { userId: user.id },
              });
            }
            if (parentRole) {
              const existingUserRole = await tx.userRole.findFirst({
                where: { userId: user.id, roleId: parentRole.id },
              });
              if (!existingUserRole) {
                await tx.userRole.create({
                  data: { userId: user.id, roleId: parentRole.id },
                });
              }
            }
          }
        }

        // Step H: Record row success linking studentId
        await tx.studentImportRow.create({
          data: {
            batchId: batch.id,
            rowNumber: row.rowNumber,
            studentId: student.id,
            status: ImportRowStatus.SUCCESS,
            rawDataJson: row as unknown as object,
          },
        });

        return student;
      });

      successfulStudents.push({
        rowNumber: row.rowNumber,
        studentId: createdStudent.id,
        admissionNumber: createdStudent.admissionNumber,
        studentName: `${createdStudent.firstName} ${createdStudent.lastName}`,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown row processing error';
      failedRows.push({ rowNumber: row.rowNumber, errorMessage });

      // Record failed row outside the rolled-back transaction
      await prisma.studentImportRow.create({
        data: {
          batchId: batch.id,
          rowNumber: row.rowNumber,
          status: ImportRowStatus.FAILED,
          rawDataJson: row as unknown as object,
          errorMessage,
        },
      });
    }
  }

  // 4. Update Batch summary status
  const finalStatus =
    failedRows.length === 0
      ? ImportBatchStatus.COMPLETED
      : successfulStudents.length > 0
        ? ImportBatchStatus.PARTIALLY_COMPLETED
        : ImportBatchStatus.FAILED;

  await prisma.studentImportBatch.update({
    where: { id: batch.id },
    data: {
      totalSuccessful: successfulStudents.length,
      totalFailed: failedRows.length,
      status: finalStatus,
    },
  });

  return {
    batchId: batch.id,
    batchNumber: batch.batchNumber,
    totalSubmitted: input.rows.length,
    totalSuccessful: successfulStudents.length,
    totalFailed: failedRows.length,
    status: finalStatus,
    successfulStudents,
    failedRows,
  };
}
