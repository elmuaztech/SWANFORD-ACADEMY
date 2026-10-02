import { prisma } from '@/lib/prisma';
import {
  ApplicationPaymentStatus,
  ApplicationStatus,
  Gender,
  GatewayProvider,
  GatewayTransactionStatus,
  Prisma,
  ProgrammeSelectionStatus,
  RelationshipType,
  RoleCode,
  UserStatus,
  VerificationTokenType,
  NotificationChannel,
  NotificationStatus,
} from '@prisma/client';
import { requirePermission, AuthorizationError } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { SafeUser } from '@/lib/auth/service';
import { evaluateAdmissionWindow, isProgrammeAvailableForApplication } from '@/lib/admission_window';
import { generateNextApplicationNumber } from './application_number';
import { calculateApplicationCharges } from './fee_calculation';
import { matchExistingGuardian } from '@/lib/guardians/guardian_matching';
import { z } from 'zod';
import { enqueueNotification } from '@/lib/notifications/outbox';
import { NotificationCategory } from '@/lib/notifications/types';
import { processPendingNotifications } from '@/lib/notifications/worker';
import { readMediaFile } from '@/lib/media/storage';
import { createUnactivatedPasswordSentinel } from '@/lib/auth/password';
import { generateSecureToken } from '@/lib/auth/tokens';
import {
  renderApplicationSubmittedEmail,
  renderApplicationFeeConfirmedEmail,
  renderAdmissionDecisionEmail,
  renderOfficialAdmissionLetterEmail,
  renderAccountActivationEmail,
} from '@/lib/notifications/templates';

export const CreateApplicationSchema = z.object({
  admissionCycleId: z.string().uuid(),
  applicantFirstName: z.string().min(2).max(50).trim(),
  applicantLastName: z.string().min(2).max(50).trim(),
  applicantOtherNames: z.string().max(50).trim().optional().nullable(),
  applicantGender: z.nativeEnum(Gender),
  applicantDob: z.coerce.date(),
  profilePhotoId: z.string().uuid().optional().nullable(),

  guardianFirstName: z.string().min(2).max(50).trim(),
  guardianLastName: z.string().min(2).max(50).trim(),
  guardianEmail: z.string().email().toLowerCase().trim(),
  guardianPhone: z.string().min(8).max(20).trim(),
  guardianRelationship: z.nativeEnum(RelationshipType),

  programmeSelections: z
    .array(
      z.object({
        programmeId: z.string().uuid(),
        targetClassId: z.string().uuid().optional().nullable(),
      })
    )
    .min(1, 'At least one programme must be selected for admission.'),
});

export type CreateApplicationInput = z.infer<typeof CreateApplicationSchema>;

export const ReviewSelectionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  decisionNotes: z.string().max(1000).optional().nullable(),
});

export type ReviewSelectionInput = z.infer<typeof ReviewSelectionSchema>;

export const ConfirmPaymentSchema = z.object({
  paymentReference: z.string().min(5).max(100).trim(),
  amountPaidKobo: z.bigint().or(z.number().transform((n) => BigInt(n))),
});

export type ConfirmPaymentInput = z.infer<typeof ConfirmPaymentSchema>;

/**
 * Active application states for duplicate detection.
 * Rejected applications or discarded prior cycles do NOT block legitimate reapplication.
 */
const ACTIVE_DUPLICATE_APPLICATION_STATES: ApplicationStatus[] = [
  ApplicationStatus.DRAFT,
  ApplicationStatus.SUBMITTED,
  ApplicationStatus.UNDER_REVIEW,
  ApplicationStatus.APPROVED,
  ApplicationStatus.PARTIALLY_APPROVED,
  ApplicationStatus.ENROLLED,
];

/**
 * Checks for potential duplicate applications in the same admission cycle.
 * Refined by application state: rejects active duplicates while preserving history.
 */
export async function checkDuplicateApplication(
  input: {
    admissionCycleId: string;
    guardianEmail: string;
    applicantFirstName: string;
    applicantLastName: string;
    applicantDob: Date;
  },
  excludeApplicationId?: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const existing = await client.application.findFirst({
    where: {
      admissionCycleId: input.admissionCycleId,
      guardianEmail: input.guardianEmail.toLowerCase().trim(),
      applicantFirstName: { equals: input.applicantFirstName.trim(), mode: 'insensitive' },
      applicantLastName: { equals: input.applicantLastName.trim(), mode: 'insensitive' },
      applicantDob: input.applicantDob,
      status: { in: ACTIVE_DUPLICATE_APPLICATION_STATES },
      ...(excludeApplicationId ? { id: { not: excludeApplicationId } } : {}),
    },
    include: {
      admissionCycle: true,
    },
  });

  return existing;
}

/**
 * Creates a public admission application (in DRAFT status) with server-calculated fee snapshot.
 * Concurrency-safe, immutable application number (APP-YYYY-NNNN).
 */
export async function createDraftApplication(
  input: CreateApplicationInput,
  now: Date = new Date(),
  externalTx?: Prisma.TransactionClient
) {
  const validated = CreateApplicationSchema.parse(input);
  const dbClient = externalTx || prisma;

  // 1. Verify admission cycle exists and window is actively open
  const cycle = await dbClient.admissionCycle.findUnique({
    where: { id: validated.admissionCycleId },
    include: {
      academicSession: true,
      programmeAvailabilities: {
        include: { programme: true },
      },
    },
  });

  if (!cycle) {
    throw new AuthorizationError('Admission cycle not found.', 404, 'CYCLE_NOT_FOUND');
  }

  const windowEvaluation = evaluateAdmissionWindow(cycle, now);
  if (!windowEvaluation.canAcceptDrafts) {
    throw new AuthorizationError(
      `Cannot initiate application: ${windowEvaluation.message}`,
      400,
      'ADMISSION_WINDOW_CLOSED'
    );
  }

  // 2. Reject duplicate selection of the same programme within this single application
  const progIds = validated.programmeSelections.map((p) => p.programmeId);
  const uniqueProgIds = new Set(progIds);
  if (uniqueProgIds.size !== progIds.length) {
    throw new AuthorizationError(
      'Duplicate programme selection detected within the same application.',
      400,
      'DUPLICATE_PROGRAMME_SELECTION'
    );
  }

  // 3. Verify that each selected programme is currently OPEN in this cycle
  for (const progId of progIds) {
    const availability = cycle.programmeAvailabilities.find((p) => p.programmeId === progId);
    const check = isProgrammeAvailableForApplication(availability);
    if (!check.isAvailable) {
      const progName = availability?.programme.name || progId;
      throw new AuthorizationError(
        `Programme '${progName}' is not accepting applications: ${check.message}`,
        400,
        'PROGRAMME_NOT_AVAILABLE'
      );
    }
  }

  // 4. State-aware duplicate check: prevent duplicate active applications for same child & parent in this cycle
  const duplicate = await checkDuplicateApplication(
    {
      admissionCycleId: validated.admissionCycleId,
      guardianEmail: validated.guardianEmail,
      applicantFirstName: validated.applicantFirstName,
      applicantLastName: validated.applicantLastName,
      applicantDob: validated.applicantDob,
    },
    undefined,
    dbClient
  );

  if (duplicate) {
    throw new AuthorizationError(
      `An active application (${duplicate.applicationNumber}) already exists for ${validated.applicantFirstName} ${validated.applicantLastName} under this admission cycle.`,
      400,
      'DUPLICATE_APPLICATION_EXISTS'
    );
  }

  // 5. Conservative Guardian Matching
  const guardianMatch = await matchExistingGuardian(
    {
      firstName: validated.guardianFirstName,
      lastName: validated.guardianLastName,
      email: validated.guardianEmail,
      phonePrimary: validated.guardianPhone,
    },
    dbClient
  );

  const existingGuardianId =
    guardianMatch.matchType === 'EXACT_EMAIL_MATCH' && !guardianMatch.hasConflict
      ? guardianMatch.matchedGuardianId
      : null;

  // 6. Generate Concurrency-Safe Application Number (APP-YYYY-NNNN)
  const applicationYear = now.getFullYear();
  const applicationNumber = await generateNextApplicationNumber(applicationYear, dbClient);

  // 7. Calculate fee items snapshot dynamically from configuration & fee structures
  const pricing = await calculateApplicationCharges(
    {
      academicSessionId: cycle.academicSessionId,
      applicantGender: validated.applicantGender,
      programmeSelections: validated.programmeSelections,
    },
    dbClient
  );

  const executeInTx = async (tx: Prisma.TransactionClient) => {
    // 8. Create Application record
    const application = await tx.application.create({
      data: {
        applicationNumber,
        academicSessionId: cycle.academicSessionId,
        admissionCycleId: cycle.id,
        applicantFirstName: validated.applicantFirstName,
        applicantLastName: validated.applicantLastName,
        applicantOtherNames: validated.applicantOtherNames || null,
        applicantGender: validated.applicantGender,
        applicantDob: validated.applicantDob,
        guardianFirstName: validated.guardianFirstName,
        guardianLastName: validated.guardianLastName,
        guardianEmail: validated.guardianEmail,
        guardianPhone: validated.guardianPhone,
        guardianRelationship: validated.guardianRelationship,
        existingGuardianId,
        profilePhotoId: validated.profilePhotoId || null,
        totalAmountKobo: pricing.totalAmountKobo,
        amountPaidKobo: BigInt(0),
        paymentStatus: ApplicationPaymentStatus.UNPAID,
        status: ApplicationStatus.DRAFT,
      },
    });

    // 9. Create Programme Selections
    const createdSelections: Record<string, string> = {};
    for (const sel of validated.programmeSelections) {
      const selection = await tx.applicationProgrammeSelection.create({
        data: {
          applicationId: application.id,
          programmeId: sel.programmeId,
          targetClassId: sel.targetClassId || null,
          status: ProgrammeSelectionStatus.PENDING,
        },
      });
      createdSelections[sel.programmeId] = selection.id;
    }

    // 10. Snapshot Charge Items into database (Immutable financial copy)
    for (const item of pricing.chargeItems) {
      const selectionId = item.programmeId ? createdSelections[item.programmeId] : null;
      await tx.applicationChargeItem.create({
        data: {
          applicationId: application.id,
          programmeSelectionId: selectionId,
          chargeType: item.chargeType,
          description: item.description,
          unitAmountKobo: item.unitAmountKobo,
          quantity: item.quantity,
          totalAmountKobo: item.totalAmountKobo,
        },
      });
    }

    return tx.application.findUniqueOrThrow({
      where: { id: application.id },
      include: {
        programmeSelections: { include: { programme: true } },
        chargeItems: true,
        admissionCycle: true,
      },
    });
  };

  return externalTx ? await executeInTx(externalTx) : await prisma.$transaction(executeInTx);
}

/**
 * Submits an application form.
 * Validates that the admission window is still actively open.
 * Moves status from DRAFT -> SUBMITTED and sets paymentStatus = PAYMENT_PENDING.
 */
export async function submitApplication(
  applicationId: string,
  now: Date = new Date(),
  externalTx?: Prisma.TransactionClient
) {
  const dbClient = externalTx || prisma;

  const application = await dbClient.application.findUnique({
    where: { id: applicationId },
    include: {
      admissionCycle: true,
      programmeSelections: true,
    },
  });

  if (!application) {
    throw new AuthorizationError('Application not found.', 404, 'APPLICATION_NOT_FOUND');
  }

  if (application.status !== ApplicationStatus.DRAFT) {
    throw new AuthorizationError(
      `Cannot submit application in status '${application.status}'. Only DRAFT applications can be submitted.`,
      400,
      'INVALID_APPLICATION_STATUS'
    );
  }

  // Temporal window verification: drafts CANNOT be submitted after cycle closes
  const windowEvaluation = evaluateAdmissionWindow(application.admissionCycle, now);
  if (!windowEvaluation.canAcceptSubmissions) {
    throw new AuthorizationError(
      `Cannot submit application: ${windowEvaluation.message}`,
      400,
      'ADMISSION_WINDOW_CLOSED'
    );
  }

  const executeInTx = async (tx: Prisma.TransactionClient) => {
    const updated = await tx.application.update({
      where: { id: applicationId },
      data: {
        status: ApplicationStatus.SUBMITTED,
        paymentStatus:
          application.paymentStatus === ApplicationPaymentStatus.UNPAID
            ? ApplicationPaymentStatus.PAYMENT_PENDING
            : application.paymentStatus,
      },
      include: {
        programmeSelections: { include: { programme: true } },
        chargeItems: true,
        admissionCycle: true,
      },
    });

    await tx.auditLog.create({
      data: {
        action: 'APPLICATION_SUBMITTED',
        entityType: 'application',
        entityId: applicationId,
        newValues: {
          applicationNumber: updated.applicationNumber,
          status: updated.status,
          paymentStatus: updated.paymentStatus,
          totalAmountKobo: updated.totalAmountKobo.toString(),
        },
      },
    });

    // Enqueue non-authoritative submission notification (ADMISSION_GENERAL, optional)
    const rendered = renderApplicationSubmittedEmail({
      guardianName: `${updated.guardianFirstName} ${updated.guardianLastName}`.trim(),
      applicantName: `${updated.applicantFirstName} ${updated.applicantLastName}`.trim(),
      applicationNumber: updated.applicationNumber,
      programmesList: updated.programmeSelections.map((ps) => ps.programme.name).join(', '),
      totalFeeKobo: updated.totalAmountKobo,
    });

    await enqueueNotification(
      {
        idempotencyKey: `ADMISSION:SUBMITTED:${applicationId}:${updated.applicationNumber}`,
        recipientEmail: updated.guardianEmail,
        channel: 'EMAIL',
        category: NotificationCategory.ADMISSION_GENERAL,
        templateName: 'APPLICATION_SUBMISSION',
        subject: rendered.subject,
        bodyText: rendered.text,
        htmlBody: rendered.html,
        metadata: {
          applicationId,
          applicationNumber: updated.applicationNumber,
          totalFeeKobo: updated.totalAmountKobo.toString(),
        },
      },
      tx
    );

    // Administrative In-App Alert for Super Admin & Admissions Staff
    await tx.notification.create({
      data: {
        idempotencyKey: `ADMIN_NOTIF:APPLICATION_SUBMITTED:${applicationId}`,
        recipientUserId: null,
        recipientEmail: null,
        channel: NotificationChannel.EMAIL,
        category: NotificationCategory.ADMISSION_GENERAL,
        templateName: 'ADMIN_ADMISSION_ALERT',
        subject: `New Admission Application: ${updated.applicationNumber} — ${updated.applicantFirstName} ${updated.applicantLastName}`,
        bodyText: `A new admission application (${updated.applicationNumber}) has been submitted for ${updated.applicantFirstName} ${updated.applicantLastName}.\nProgrammes: ${updated.programmeSelections.map((ps) => ps.programme.name).join(', ')}\nTotal Fee: ₦${(Number(updated.totalAmountKobo) / 100).toLocaleString()}\nGuardian: ${updated.guardianFirstName} ${updated.guardianLastName} (${updated.guardianEmail})`,
        status: NotificationStatus.DELIVERED,
        sentAt: new Date(),
        metadata: {
          applicationId: updated.id,
          applicationNumber: updated.applicationNumber,
          applicantName: `${updated.applicantFirstName} ${updated.applicantLastName}`,
          guardianEmail: updated.guardianEmail,
          totalAmountKobo: updated.totalAmountKobo.toString(),
          status: 'SUBMITTED',
          linkUrl: `/admin/admissions/${updated.id}`,
        },
      },
    });

    return updated;
  };

  return externalTx ? await executeInTx(externalTx) : await prisma.$transaction(executeInTx);
}

/**
 * Trusted Payment Confirmation Boundary.
 * Master Specification Amendment 3:
 * Ordinary client requests are NEVER permitted to self-declare payment.
 * Requires authorized administrator (ADMISSION_APPLICATION_APPROVE or FINANCE_PAYMENT_RECONCILE).
 */
export async function confirmApplicationPayment(
  actor: SafeUser,
  applicationId: string,
  input: ConfirmPaymentInput,
  externalTx?: Prisma.TransactionClient
) {
  await requirePermission(actor, PermissionCode.ADMISSION_APPLICATION_APPROVE);
  const validated = ConfirmPaymentSchema.parse(input);
  const dbClient = externalTx || prisma;

  const application = await dbClient.application.findUnique({
    where: { id: applicationId },
  });

  if (!application) {
    throw new AuthorizationError('Application not found.', 404, 'APPLICATION_NOT_FOUND');
  }

  if (application.paymentStatus === ApplicationPaymentStatus.PAYMENT_CONFIRMED) {
    return application;
  }

  const executeInTx = async (tx: Prisma.TransactionClient) => {
    const updated = await tx.application.update({
      where: { id: applicationId },
      data: {
        paymentStatus: ApplicationPaymentStatus.PAYMENT_CONFIRMED,
        paymentReference: validated.paymentReference,
        amountPaidKobo: validated.amountPaidKobo,
        // Advance SUBMITTED to UNDER_REVIEW upon trusted payment verification
        status:
          application.status === ApplicationStatus.SUBMITTED
            ? ApplicationStatus.UNDER_REVIEW
            : application.status,
      },
      include: {
        programmeSelections: { include: { programme: true } },
        chargeItems: true,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'APPLICATION_FEE_VERIFIED',
        entityType: 'application',
        entityId: applicationId,
        newValues: {
          paymentStatus: updated.paymentStatus,
          paymentReference: updated.paymentReference,
          amountPaidKobo: updated.amountPaidKobo.toString(),
          status: updated.status,
        },
      },
    });

    // Enqueue payment confirmation notification (FINANCE, mandatory)
    const rendered = renderApplicationFeeConfirmedEmail({
      guardianName: `${application.guardianFirstName} ${application.guardianLastName}`.trim(),
      applicantName: `${application.applicantFirstName} ${application.applicantLastName}`.trim(),
      applicationNumber: application.applicationNumber,
      paymentReference: validated.paymentReference,
      amountKobo: validated.amountPaidKobo,
    });

    // Ensure payment transaction record is created/updated for financial audit & reconciliation
    await tx.paymentTransaction.upsert({
      where: { gatewayReference: validated.paymentReference },
      create: {
        gatewayReference: validated.paymentReference,
        gatewayProvider: GatewayProvider.PAYSTACK,
        applicationId,
        amountKobo: validated.amountPaidKobo,
        status: GatewayTransactionStatus.SUCCESS,
        customerEmail: application.guardianEmail,
        paidAt: new Date(),
      },
      update: {
        applicationId,
        amountKobo: validated.amountPaidKobo,
        status: GatewayTransactionStatus.SUCCESS,
        paidAt: new Date(),
      },
    });

    await enqueueNotification(
      {
        idempotencyKey: `FINANCE:APP_FEE_CONFIRMED:${applicationId}:${validated.paymentReference}`,
        recipientEmail: application.guardianEmail,
        channel: 'EMAIL',
        category: NotificationCategory.FINANCE,
        templateName: 'APPLICATION_FEE_CONFIRMED',
        subject: rendered.subject,
        bodyText: rendered.text,
        htmlBody: rendered.html,
        metadata: {
          applicationId,
          paymentReference: validated.paymentReference,
        },
      },
      tx
    );

    return updated;
  };

  const result = externalTx ? await executeInTx(externalTx) : await prisma.$transaction(executeInTx);
  // Trigger notification worker immediately so confirmation email is sent without delay
  processPendingNotifications().catch(() => {});
  return result;
}

/**
 * Reviews an individual programme selection within an application (APPROVED or REJECTED).
 * Computes overall application status:
 * - All selections approved -> APPROVED
 * - All selections rejected -> REJECTED
 * - Mixed decisions -> PARTIALLY_APPROVED
 * - Some pending -> UNDER_REVIEW
 */
export async function reviewProgrammeSelection(
  actor: SafeUser,
  selectionId: string,
  input: ReviewSelectionInput,
  externalTx?: Prisma.TransactionClient
) {
  await requirePermission(actor, PermissionCode.ADMISSION_APPLICATION_REVIEW);
  const validated = ReviewSelectionSchema.parse(input);
  const dbClient = externalTx || prisma;

  const selection = await dbClient.applicationProgrammeSelection.findUnique({
    where: { id: selectionId },
    include: {
      application: {
        include: {
          programmeSelections: { include: { programme: true } },
          admissionCycle: { include: { academicSession: true } },
          profilePhoto: true,
        },
      },
      programme: true,
    },
  });

  if (!selection) {
    throw new AuthorizationError('Programme selection not found.', 404, 'SELECTION_NOT_FOUND');
  }

  const application = selection.application;
  if (application.status === ApplicationStatus.ENROLLED) {
    throw new AuthorizationError(
      'Cannot alter selection review decisions on an already ENROLLED student application.',
      400,
      'APPLICATION_ALREADY_ENROLLED'
    );
  }

  if (validated.decision === 'APPROVED') {
    await requirePermission(actor, PermissionCode.ADMISSION_APPLICATION_APPROVE);
    const actorRoles = actor.roles || [];
    if (!actorRoles.includes(RoleCode.SUPER_ADMIN)) {
      throw new AuthorizationError(
        'Only a user with the SUPER_ADMIN role may accept an admission and trigger portal creation.',
        403,
        'SUPER_ADMIN_REQUIRED'
      );
    }
  }

  const newSelectionStatus =
    validated.decision === 'APPROVED'
      ? ProgrammeSelectionStatus.APPROVED
      : ProgrammeSelectionStatus.REJECTED;

  const executeInTx = async (tx: Prisma.TransactionClient) => {
    // 1. Update selection decision
    const updatedSelection = await tx.applicationProgrammeSelection.update({
      where: { id: selectionId },
      data: {
        status: newSelectionStatus,
        decisionNotes: validated.decisionNotes || null,
        reviewedAt: new Date(),
        reviewedByUserId: actor.id,
      },
      include: { programme: true },
    });

    // 2. Query all sibling selections to compute overall application state
    const allSelections = await tx.applicationProgrammeSelection.findMany({
      where: { applicationId: application.id },
    });

    const approvedCount = allSelections.filter((s) => s.status === ProgrammeSelectionStatus.APPROVED).length;
    const rejectedCount = allSelections.filter((s) => s.status === ProgrammeSelectionStatus.REJECTED).length;
    const pendingCount = allSelections.filter((s) => s.status === ProgrammeSelectionStatus.PENDING).length;

    let computedAppStatus: ApplicationStatus;
    if (pendingCount > 0) {
      computedAppStatus = ApplicationStatus.UNDER_REVIEW;
    } else if (approvedCount > 0 && rejectedCount === 0) {
      computedAppStatus = ApplicationStatus.APPROVED;
    } else if (approvedCount === 0 && rejectedCount > 0) {
      computedAppStatus = ApplicationStatus.REJECTED;
    } else if (approvedCount > 0 && rejectedCount > 0) {
      computedAppStatus = ApplicationStatus.PARTIALLY_APPROVED;
    } else {
      computedAppStatus = ApplicationStatus.UNDER_REVIEW;
    }

    const updatedApp = await tx.application.update({
      where: { id: application.id },
      data: { status: computedAppStatus },
    });

    // 3. Emit audit log
    const auditAction =
      validated.decision === 'APPROVED'
        ? 'PROGRAMME_SELECTION_APPROVED'
        : 'PROGRAMME_SELECTION_REJECTED';

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: auditAction,
        entityType: 'application_programme_selection',
        entityId: selectionId,
        newValues: {
          applicationNumber: application.applicationNumber,
          programme: selection.programme.name,
          decision: validated.decision,
          overallApplicationStatus: updatedApp.status,
          decisionNotes: validated.decisionNotes,
        },
      },
    });

    // 4. Enqueue admission decision notification if a terminal or actionable decision has been reached
    if (
      computedAppStatus === ApplicationStatus.APPROVED ||
      computedAppStatus === ApplicationStatus.PARTIALLY_APPROVED
    ) {
      // Build list of approved programmes
      const approvedProgrammeNames = allSelections
        .filter((s) =>
          s.id === selectionId
            ? newSelectionStatus === ProgrammeSelectionStatus.APPROVED
            : s.status === ProgrammeSelectionStatus.APPROVED
        )
        .map((s) => {
          const matched = application.programmeSelections.find((p) => p.id === s.id);
          return matched?.programme?.name || 'Academic Programme';
        });

      const programmesList = approvedProgrammeNames.join(', ') || selection.programme.name;
      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const admissionLetterUrl = `${appUrl}/admissions/letter/${application.id}`;

      // Convert applicant photo to base64 Data URI for immediate inline email/letter rendering
      let profilePhotoDataUri: string | null = null;
      if (application.profilePhoto?.storageKey) {
        try {
          const buffer = await readMediaFile(application.profilePhoto.storageKey);
          profilePhotoDataUri = `data:${application.profilePhoto.mimeType || 'image/jpeg'};base64,${buffer.toString('base64')}`;
        } catch {
          // Gracefully fall back to monogram crest
        }
      }

      const letterRendered = renderOfficialAdmissionLetterEmail({
        guardianName: `${application.guardianFirstName} ${application.guardianLastName}`.trim(),
        guardianPhone: application.guardianPhone,
        applicantName: `${application.applicantFirstName} ${application.applicantLastName}`.trim(),
        applicationNumber: application.applicationNumber,
        applicantDob: application.applicantDob.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
        applicantGender: application.applicantGender === 'MALE' ? 'Male' : 'Female',
        programmesList,
        academicSessionName: application.admissionCycle?.academicSession?.name || '2026/2027 Academic Session',
        profilePhotoDataUri,
        admissionLetterUrl,
        notes: validated.decisionNotes || undefined,
      });

      await enqueueNotification(
        {
          idempotencyKey: `ADMISSION_LETTER:${computedAppStatus}:${application.id}`,
          recipientEmail: application.guardianEmail,
          channel: 'EMAIL',
          category: NotificationCategory.ADMISSION_DECISION,
          templateName: 'ADMISSION_DECISION',
          subject: letterRendered.subject,
          bodyText: letterRendered.text,
          htmlBody: letterRendered.html,
          metadata: {
            applicationId: application.id,
            decision: computedAppStatus,
            letterUrl: admissionLetterUrl,
          },
        },
        tx
      );
    } else if (computedAppStatus === ApplicationStatus.REJECTED) {
      const rendered = renderAdmissionDecisionEmail({
        guardianName: `${application.guardianFirstName} ${application.guardianLastName}`.trim(),
        applicantName: `${application.applicantFirstName} ${application.applicantLastName}`.trim(),
        applicationNumber: application.applicationNumber,
        decision: 'REJECTED',
        notes: validated.decisionNotes || undefined,
      });

      await enqueueNotification(
        {
          idempotencyKey: `ADMISSION_DECISION:REJECTED:${application.id}`,
          recipientEmail: application.guardianEmail,
          channel: 'EMAIL',
          category: NotificationCategory.ADMISSION_DECISION,
          templateName: 'ADMISSION_DECISION',
          subject: rendered.subject,
          bodyText: rendered.text,
          htmlBody: rendered.html,
          metadata: {
            applicationId: application.id,
            decision: computedAppStatus,
            decisionNotes: validated.decisionNotes || null,
          },
        },
        tx
      );
    }

    // 5. SUPER ADMIN ACCEPTANCE GATE: Portal User Account Provisioning
    // A portal account must NEVER be created automatically before a Super Admin accepts the admission.
    // Enforced strictly on backend: only when overall decision reaches APPROVED or PARTIALLY_APPROVED.
    if (
      computedAppStatus === ApplicationStatus.APPROVED ||
      computedAppStatus === ApplicationStatus.PARTIALLY_APPROVED
    ) {
      const normalizedGuardianEmail = application.guardianEmail.trim().toLowerCase();
      const existingUser = await tx.user.findUnique({
        where: { email: normalizedGuardianEmail },
      });

      if (!existingUser) {
        const sentinelHash = createUnactivatedPasswordSentinel();
        const { rawToken, tokenHash } = generateSecureToken();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        const parentRole = await tx.role.findUnique({
          where: { code: RoleCode.PARENT },
        });

        if (parentRole) {
          let userPhone: string | null = null;
          if (application.guardianPhone && application.guardianPhone.trim()) {
            const existingPhoneUser = await tx.user.findFirst({
              where: { phoneNumber: application.guardianPhone.trim() },
            });
            if (!existingPhoneUser) {
              userPhone = application.guardianPhone.trim();
            }
          }

          const newUser = await tx.user.create({
            data: {
              email: normalizedGuardianEmail,
              phoneNumber: userPhone,
              passwordHash: sentinelHash,
              status: UserStatus.PENDING_VERIFICATION,
              userRoles: {
                create: [{ roleId: parentRole.id }],
              },
              emailVerifications: {
                create: {
                  tokenHash,
                  email: normalizedGuardianEmail,
                  tokenType: VerificationTokenType.ACCOUNT_ACTIVATION,
                  expiresAt,
                },
              },
            },
          });

          // Immutable Audit Log for portal account provisioning
          await tx.auditLog.create({
            data: {
              userId: actor.id,
              action: 'PARENT_PORTAL_ACCOUNT_PROVISIONED_ON_ADMISSION_ACCEPTANCE',
              entityType: 'User',
              entityId: newUser.id,
              newValues: {
                email: normalizedGuardianEmail,
                applicationNumber: application.applicationNumber,
                role: RoleCode.PARENT,
                status: UserStatus.PENDING_VERIFICATION,
              },
            },
          });

          // Enqueue Account Activation Email with single-use secure token link
          const appUrl = process.env.APP_URL || 'http://localhost:3000';
          const activationUrl = `${appUrl}/auth/activate?token=${rawToken}`;
          const guardianFullName = `${application.guardianFirstName} ${application.guardianLastName}`.trim();

          const activationEmail = renderAccountActivationEmail({
            recipientName: guardianFullName,
            activationUrl,
            expiresInHours: 24,
          });

          await enqueueNotification(
            {
              idempotencyKey: `AUTH:ACTIVATION:ADMISSION:${application.id}:${newUser.id}`,
              recipientEmail: normalizedGuardianEmail,
              recipientUserId: newUser.id,
              channel: 'EMAIL',
              category: NotificationCategory.SECURITY,
              templateName: 'ACCOUNT_ACTIVATION',
              subject: activationEmail.subject,
              bodyText: activationEmail.text,
              htmlBody: activationEmail.html,
              metadata: {
                applicationId: application.id,
                applicationNumber: application.applicationNumber,
                userId: newUser.id,
                activationUrl,
              },
            },
            tx
          );

          // Administrative In-App Alert for Super Admin
          await tx.notification.create({
            data: {
              idempotencyKey: `ADMIN_NOTIF:PARENT_PROVISIONED:${application.id}:${newUser.id}`,
              recipientUserId: null,
              recipientEmail: null,
              channel: NotificationChannel.EMAIL,
              category: NotificationCategory.SECURITY,
              templateName: 'ADMIN_ACCOUNT_PROVISIONED_ALERT',
              subject: `Parent Portal Account Provisioned: ${normalizedGuardianEmail}`,
              bodyText: `Parent portal account provisioned for ${guardianFullName} (${normalizedGuardianEmail}) following admission acceptance for application ${application.applicationNumber}.\nActivation email dispatched with single-use token.`,
              status: NotificationStatus.DELIVERED,
              sentAt: new Date(),
              metadata: {
                applicationId: application.id,
                applicationNumber: application.applicationNumber,
                userId: newUser.id,
                parentEmail: normalizedGuardianEmail,
                action: 'PARENT_PORTAL_ACCOUNT_PROVISIONED',
              },
            },
          });
        }
      }
    }

    return {
      selection: updatedSelection,
      applicationStatus: updatedApp.status,
    };
  };

  const result = externalTx ? await executeInTx(externalTx) : await prisma.$transaction(executeInTx);
  // Trigger notification worker immediately so decision/admission letter email is sent without delay
  processPendingNotifications().catch(() => {});
  return result;
}

/**
 * Retrieves an application with full details, selections, charges, and review history.
 */
export async function getApplicationById(
  actor: SafeUser,
  applicationId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  await requirePermission(actor, PermissionCode.ADMISSION_APPLICATION_VIEW);

  const application = await client.application.findUnique({
    where: { id: applicationId },
    include: {
      admissionCycle: { include: { academicSession: true } },
      programmeSelections: {
        include: { programme: true, targetClass: true, reviewedByUser: true },
      },
      chargeItems: true,
      reviews: { include: { reviewer: true } },
      admittedStudent: true,
      existingGuardian: true,
    },
  });

  if (!application) {
    throw new AuthorizationError('Application not found.', 404, 'APPLICATION_NOT_FOUND');
  }

  return application;
}

/**
 * Lists applications for administrative review with search, status, and cycle filters.
 */
export async function listApplications(
  actor: SafeUser,
  filter?: {
    admissionCycleId?: string;
    status?: ApplicationStatus;
    paymentStatus?: ApplicationPaymentStatus;
    search?: string;
  },
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  await requirePermission(actor, PermissionCode.ADMISSION_APPLICATION_VIEW);

  const where: Prisma.ApplicationWhereInput = {};

  if (filter?.admissionCycleId) {
    where.admissionCycleId = filter.admissionCycleId;
  }
  if (filter?.status) {
    where.status = filter.status;
  }
  if (filter?.paymentStatus) {
    where.paymentStatus = filter.paymentStatus;
  }
  if (filter?.search) {
    const term = filter.search.trim();
    where.OR = [
      { applicationNumber: { contains: term, mode: 'insensitive' } },
      { applicantFirstName: { contains: term, mode: 'insensitive' } },
      { applicantLastName: { contains: term, mode: 'insensitive' } },
      { guardianEmail: { contains: term, mode: 'insensitive' } },
      { guardianPhone: { contains: term } },
    ];
  }

  return client.application.findMany({
    where,
    include: {
      admissionCycle: true,
      programmeSelections: { include: { programme: true } },
      _count: { select: { chargeItems: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Permanently deletes an admission application record.
 * Safety rule: Enrolled applications cannot be deleted.
 */
export async function deleteApplication(
  actor: SafeUser,
  applicationId: string,
  externalTx?: Prisma.TransactionClient
) {
  await requirePermission(actor, PermissionCode.ADMISSION_APPLICATION_REVIEW);
  const dbClient = externalTx || prisma;

  const application = await dbClient.application.findUnique({
    where: { id: applicationId },
    include: {
      admittedStudent: true,
    },
  });

  if (!application) {
    throw new AuthorizationError('Application not found.', 404, 'APPLICATION_NOT_FOUND');
  }

  if (application.status === ApplicationStatus.ENROLLED || application.admittedStudentId) {
    throw new AuthorizationError(
      'Cannot delete an application for a student who is already enrolled in the institution.',
      400,
      'APPLICATION_ALREADY_ENROLLED'
    );
  }

  const executeInTx = async (tx: Prisma.TransactionClient) => {
    // Delete application; cascading handles programme selections, charge items, reviews, sessions
    await tx.application.delete({
      where: { id: applicationId },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'APPLICATION_DELETED',
        entityType: 'application',
        entityId: applicationId,
        newValues: {
          applicationNumber: application.applicationNumber,
          applicantName: `${application.applicantFirstName} ${application.applicantLastName}`,
          guardianEmail: application.guardianEmail,
        },
      },
    });

    return { success: true, deletedApplicationId: applicationId };
  };

  return externalTx ? await executeInTx(externalTx) : await prisma.$transaction(executeInTx);
}
