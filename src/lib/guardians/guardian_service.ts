import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthorizationError } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import {
  Prisma,
  RoleCode,
  UserStatus,
  VerificationTokenType,
  NotificationCategory,
  NotificationChannel,
} from '@prisma/client';
import { SafeUser } from '@/lib/auth/service';
import { createUnactivatedPasswordSentinel } from '@/lib/auth/password';
import { generateSecureToken } from '@/lib/auth/tokens';
import { enqueueNotification } from '@/lib/notifications/outbox';
import { renderWelcomeNewUserEmail } from '@/lib/notifications/templates/catalog';
import { matchExistingGuardian } from './guardian_matching';
import { toAbsoluteEmailUrl } from '@/lib/utils/url';

/**
 * Swanford Academy — Guardian Profile Service
 * Master Specification Reference: Sections 7, 8
 *
 * Core Invariants:
 * - A Guardian is a person distinct from a User.
 * - Guardians can exist without an email and without a portal User account.
 * - One Guardian <-> at most one User account.
 * - Never store plaintext passwords or email permanent passwords.
 * - Conservative email-based deduplication; never auto-merge on name/phone alone.
 */

export const CreateGuardianSchema = z.object({
  title: z.string().trim().optional(),
  firstName: z.string().min(2, 'First name must be at least 2 characters').trim(),
  lastName: z.string().min(2, 'Last name must be at least 2 characters').trim(),
  otherNames: z.string().trim().optional(),
  email: z.string().email('Invalid email address format').trim().toLowerCase().optional().nullable(),
  phonePrimary: z.string().trim().optional().nullable(),
  phoneSecondary: z.string().trim().optional().nullable(),
  residentialAddress: z.string().trim().optional().nullable(),
  occupation: z.string().trim().optional().nullable(),
});

export const UpdateGuardianSchema = z.object({
  title: z.string().trim().nullable().optional(),
  firstName: z.string().min(2).trim().optional(),
  lastName: z.string().min(2).trim().optional(),
  otherNames: z.string().trim().nullable().optional(),
  email: z.string().email().trim().toLowerCase().nullable().optional(),
  phonePrimary: z.string().trim().nullable().optional(),
  phoneSecondary: z.string().trim().nullable().optional(),
  residentialAddress: z.string().trim().nullable().optional(),
  occupation: z.string().trim().nullable().optional(),
});

export type CreateGuardianInput = z.input<typeof CreateGuardianSchema>;
export type UpdateGuardianInput = z.input<typeof UpdateGuardianSchema>;

export async function createGuardian(
  actor: SafeUser,
  input: CreateGuardianInput,
  externalTx?: Prisma.TransactionClient
) {
  await requirePermission(actor, PermissionCode.GUARDIAN_EDIT);
  const validated = CreateGuardianSchema.parse(input);

  const normalizedEmail = validated.email?.trim().toLowerCase() || null;
  const dbClient = externalTx || prisma;

  // Check matching
  const match = await matchExistingGuardian(
    {
      firstName: validated.firstName,
      lastName: validated.lastName,
      email: normalizedEmail,
      phonePrimary: validated.phonePrimary,
    },
    dbClient
  );

  if (normalizedEmail) {
    const existing = await dbClient.guardian.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      return {
        guardian: existing,
        isExisting: true,
        warnings: match.conflictReason ? [match.conflictReason] : [],
      };
    }
  } else if (match.matchedGuardianId && match.matchType === 'EXACT_EMAIL_MATCH' && !match.hasConflict) {
    const existing = await dbClient.guardian.findUniqueOrThrow({
      where: { id: match.matchedGuardianId },
    });
    return {
      guardian: existing,
      isExisting: true,
      warnings: [],
    };
  }

  const executeInTx = async (tx: Prisma.TransactionClient) => {
    const created = await tx.guardian.create({
      data: {
        title: validated.title || null,
        firstName: validated.firstName,
        lastName: validated.lastName,
        otherNames: validated.otherNames || null,
        email: normalizedEmail,
        phonePrimary: validated.phonePrimary || null,
        phoneSecondary: validated.phoneSecondary || null,
        residentialAddress: validated.residentialAddress || null,
        occupation: validated.occupation || null,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'GUARDIAN_CREATE',
        entityType: 'guardian',
        entityId: created.id,
        newValues: {
          name: `${created.firstName} ${created.lastName}`,
          email: created.email,
        },
      },
    });

    return created;
  };

  const guardian = externalTx ? await executeInTx(externalTx) : await prisma.$transaction(executeInTx);

  const warnings = match.conflictReason ? [match.conflictReason] : [];

  return {
    guardian,
    isExisting: false,
    warnings,
  };
}

export async function updateGuardian(
  actor: SafeUser,
  guardianId: string,
  input: UpdateGuardianInput
) {
  const existing = await prisma.guardian.findUnique({
    where: { id: guardianId },
  });

  if (!existing) {
    throw new AuthorizationError('Guardian not found.', 404, 'GUARDIAN_NOT_FOUND');
  }

  // Authorization: must have GUARDIAN_EDIT or be the linked parent user
  const isSelf = existing.userId === actor.id;
  if (!isSelf) {
    await requirePermission(actor, PermissionCode.GUARDIAN_EDIT);
  }

  const validated = UpdateGuardianSchema.parse(input);
  const normalizedEmail = validated.email !== undefined ? (validated.email ? validated.email.trim().toLowerCase() : null) : undefined;

  // Check email uniqueness if email is changed
  if (normalizedEmail !== undefined && normalizedEmail !== existing.email && normalizedEmail !== null) {
    const inUse = await prisma.guardian.findUnique({
      where: { email: normalizedEmail },
    });
    if (inUse) {
      throw new AuthorizationError(
        `Email ${normalizedEmail} is already registered to another guardian.`,
        400,
        'EMAIL_ALREADY_IN_USE'
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.guardian.update({
      where: { id: guardianId },
      data: {
        ...(validated.title !== undefined && { title: validated.title }),
        ...(validated.firstName && { firstName: validated.firstName }),
        ...(validated.lastName && { lastName: validated.lastName }),
        ...(validated.otherNames !== undefined && { otherNames: validated.otherNames }),
        ...(normalizedEmail !== undefined && { email: normalizedEmail }),
        ...(validated.phonePrimary !== undefined && { phonePrimary: validated.phonePrimary }),
        ...(validated.phoneSecondary !== undefined && { phoneSecondary: validated.phoneSecondary }),
        ...(validated.residentialAddress !== undefined && { residentialAddress: validated.residentialAddress }),
        ...(validated.occupation !== undefined && { occupation: validated.occupation }),
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'GUARDIAN_UPDATE',
        entityType: 'guardian',
        entityId: guardianId,
        oldValues: { firstName: existing.firstName, lastName: existing.lastName },
        newValues: { firstName: res.firstName, lastName: res.lastName },
      },
    });

    return res;
  });

  return updated;
}

export async function getGuardianById(
  actor: SafeUser,
  guardianId: string
) {
  const guardian = await prisma.guardian.findUnique({
    where: { id: guardianId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          status: true,
          createdAt: true,
          lastLoginAt: true,
        },
      },
      relationships: {
        include: {
          student: {
            select: {
              id: true,
              admissionNumber: true,
              firstName: true,
              lastName: true,
              otherNames: true,
              preferredName: true,
              gender: true,
              dateOfBirth: true,
              currentStatus: true,
              programmeEnrollments: {
                where: { enrollmentStatus: 'ACTIVE' },
                include: {
                  programme: { select: { id: true, name: true, code: true } },
                  schoolClass: { select: { id: true, name: true, arm: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!guardian) {
    throw new AuthorizationError('Guardian not found.', 404, 'GUARDIAN_NOT_FOUND');
  }

  const isSelf = guardian.userId === actor.id;
  if (!isSelf) {
    await requirePermission(actor, PermissionCode.GUARDIAN_VIEW);
  }

  return guardian;
}

export async function linkGuardianUserAccount(
  actor: SafeUser,
  guardianId: string,
  userId: string
) {
  await requirePermission(actor, PermissionCode.USER_MANAGE);

  const guardian = await prisma.guardian.findUnique({
    where: { id: guardianId },
  });
  if (!guardian) {
    throw new AuthorizationError('Guardian not found.', 404, 'GUARDIAN_NOT_FOUND');
  }

  if (guardian.userId && guardian.userId !== userId) {
    throw new AuthorizationError(
      'This guardian is already linked to a different user account.',
      400,
      'GUARDIAN_ALREADY_LINKED'
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { guardianProfile: true },
  });
  if (!user) {
    throw new AuthorizationError('User account not found.', 404, 'USER_NOT_FOUND');
  }

  if (user.guardianProfile && user.guardianProfile.id !== guardianId) {
    throw new AuthorizationError(
      'This user account is already linked to another guardian profile.',
      400,
      'USER_ALREADY_LINKED'
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.guardian.update({
      where: { id: guardianId },
      data: { userId },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'GUARDIAN_USER_LINK',
        entityType: 'guardian',
        entityId: guardianId,
        newValues: { linkedUserId: userId },
      },
    });

    return res;
  });

  return updated;
}

/**
 * Lists guardians with search and pagination for administrative management.
 */
export async function listGuardians(
  actor: SafeUser,
  options?: {
    search?: string;
    limit?: number;
    offset?: number;
  }
) {
  await requirePermission(actor, PermissionCode.GUARDIAN_VIEW);

  const limit = Math.min(options?.limit || 50, 100);
  const offset = options?.offset || 0;

  const whereClause: Prisma.GuardianWhereInput = {};

  if (options?.search?.trim()) {
    const query = options.search.trim();
    whereClause.OR = [
      { firstName: { contains: query, mode: 'insensitive' } },
      { lastName: { contains: query, mode: 'insensitive' } },
      { email: { contains: query, mode: 'insensitive' } },
      { phonePrimary: { contains: query } },
    ];
  }

  const [total, guardians] = await Promise.all([
    prisma.guardian.count({ where: whereClause }),
    prisma.guardian.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            status: true,
            profilePhotoId: true,
          },
        },
        relationships: {
          include: {
            student: {
              select: {
                id: true,
                admissionNumber: true,
                firstName: true,
                lastName: true,
                currentStatus: true,
              },
            },
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: limit,
      skip: offset,
    }),
  ]);

  return {
    total,
    limit,
    offset,
    guardians,
  };
}

export interface GuardianProvisionResult {
  success: boolean;
  message: string;
  user?: any;
  result?: any;
}

/**
 * Provisions a genuine portal User account for a Guardian, assigns PARENT role,
 * creates a single-use activation token, and dispatches a welcome email.
 */
export async function provisionGuardianUserAccount(
  actor: SafeUser,
  guardianId: string,
  ipAddress?: string
): Promise<GuardianProvisionResult> {
  await requirePermission(actor, PermissionCode.USER_MANAGE);

  const guardian = await prisma.guardian.findUnique({
    where: { id: guardianId },
    include: { user: true },
  });

  if (!guardian) {
    throw new AuthorizationError('Guardian not found.', 404, 'GUARDIAN_NOT_FOUND');
  }

  if (!guardian.email) {
    throw new AuthorizationError(
      'Cannot provision portal account: Guardian has no registered email address. Please edit guardian profile to add a valid email address first.',
      400,
      'EMAIL_REQUIRED'
    );
  }

  const normalizedEmail = guardian.email.trim().toLowerCase();

  // If guardian already has a user account linked:
  if (guardian.userId && guardian.user) {
    if (guardian.user.status === UserStatus.PENDING_VERIFICATION) {
      return resendGuardianActivation(actor, guardianId, ipAddress);
    }
    return {
      success: true,
      message: 'Portal account is already active for this guardian.',
      user: guardian.user,
    };
  }

  // Find PARENT role
  const parentRole = await prisma.role.findUnique({
    where: { code: RoleCode.PARENT },
  });
  if (!parentRole) {
    throw new AuthorizationError('PARENT role not defined in system.', 500, 'ROLE_MISSING');
  }

  const result = await prisma.$transaction(async (tx) => {
    // Check if user with this email already exists
    const user = await tx.user.findUnique({
      where: { email: normalizedEmail },
      include: { userRoles: true },
    });

    if (user) {
      // Link guardian to user
      const hasParentRole = user.userRoles.some((ur) => ur.roleId === parentRole.id);
      if (!hasParentRole) {
        await tx.userRole.create({
          data: {
            userId: user.id,
            roleId: parentRole.id,
          },
        });
      }
      await tx.guardian.update({
        where: { id: guardianId },
        data: { userId: user.id },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'GUARDIAN_USER_LINK',
          entityType: 'guardian',
          entityId: guardianId,
          newValues: { linkedUserId: user.id },
          ipAddress: ipAddress || null,
        },
      });

      return { user, wasCreated: false };
    }

    // Otherwise create new user with unactivated sentinel hash
    const sentinelHash = createUnactivatedPasswordSentinel();
    const { rawToken, tokenHash } = generateSecureToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const createdUser = await tx.user.create({
      data: {
        email: normalizedEmail,
        phoneNumber: guardian.phonePrimary || null,
        passwordHash: sentinelHash,
        status: UserStatus.PENDING_VERIFICATION,
        userRoles: {
          create: [{ roleId: parentRole.id }],
        },
        emailVerifications: {
          create: {
            tokenHash,
            email: normalizedEmail,
            tokenType: VerificationTokenType.ACCOUNT_ACTIVATION,
            expiresAt,
          },
        },
      },
    });

    // Link guardian
    await tx.guardian.update({
      where: { id: guardianId },
      data: { userId: createdUser.id },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'GUARDIAN_PORTAL_ACCOUNT_PROVISIONED',
        entityType: 'guardian',
        entityId: guardianId,
        newValues: { userId: createdUser.id, email: normalizedEmail },
        ipAddress: ipAddress || null,
      },
    });

    const activationUrl = toAbsoluteEmailUrl(`/auth/activate?token=${rawToken}`);
    const recipientName = `${guardian.firstName} ${guardian.lastName}`.trim();

    const rendered = renderWelcomeNewUserEmail({
      recipientName,
      roleName: 'Parent / Guardian',
      email: normalizedEmail,
      activationUrl,
      expiresInHours: 24,
    });

    await enqueueNotification(
      {
        idempotencyKey: `SECURITY:GUARDIAN_ACTIVATION:${createdUser.id}:${tokenHash}`,
        recipientUserId: createdUser.id,
        recipientEmail: normalizedEmail,
        channel: NotificationChannel.EMAIL,
        category: NotificationCategory.SECURITY,
        templateName: 'WELCOME_NEW_USER',
        subject: rendered.subject,
        htmlBody: rendered.html,
        bodyText: rendered.text,
      },
      tx
    );

    return { user: createdUser, wasCreated: true };
  });

  return {
    success: true,
    message: result.wasCreated
      ? 'Portal account provisioned successfully and welcome activation email dispatched.'
      : 'Existing user account linked to guardian with PARENT role granted.',
    user: result.user,
  };
}

/**
 * Resends the activation email for a guardian whose account is pending verification.
 */
export async function resendGuardianActivation(
  actor: SafeUser,
  guardianId: string,
  ipAddress?: string
): Promise<GuardianProvisionResult> {
  await requirePermission(actor, PermissionCode.USER_MANAGE);

  const guardian = await prisma.guardian.findUnique({
    where: { id: guardianId },
    include: { user: true },
  });

  if (!guardian) {
    throw new AuthorizationError('Guardian not found.', 404, 'GUARDIAN_NOT_FOUND');
  }

  if (!guardian.userId || !guardian.user) {
    return provisionGuardianUserAccount(actor, guardianId, ipAddress);
  }

  const { resendUserActivation } = await import('@/lib/admin/admin_service');
  const result = await resendUserActivation(actor, guardian.userId, ipAddress);
  return {
    success: true,
    message: 'Activation email resent successfully.',
    result,
  };
}

