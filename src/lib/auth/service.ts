import { prisma } from '@/lib/prisma';
import { hashPassword, verifyPassword, validatePasswordStrength } from './password';
import { generateSecureToken, hashToken } from './tokens';
import { UserStatus, VerificationTokenType } from '@prisma/client';
import { enqueueNotification } from '@/lib/notifications/outbox';
import { NotificationCategory } from '@/lib/notifications/types';
import { renderPasswordResetEmail, renderPasswordChangedEmail } from '@/lib/notifications/templates';

/**
 * Swanford Academy — Authentication & Account Lifecycle Service
 *
 * Stage 3 Core Boundary:
 * Answers "WHO ARE YOU?" (Identity, Sessions, Passwords, Account States)
 * Does NOT answer "WHAT ARE YOU ALLOWED TO DO?" (Stage 4 RBAC/Authorization)
 *
 * Invariants:
 * - Zero in-memory auth state. All state persists in PostgreSQL.
 * - Raw security tokens never stored in DB and never logged.
 * - Passwords hashed with bcryptjs (12 rounds).
 * - Anti-enumeration on password resets.
 * - Outbox notifications decouple DB commits from SMTP.
 */

export interface SafeUser {
  id: string;
  email: string;
  phoneNumber: string | null;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  guardianId?: string;
  teacherId?: string;
}

export function sanitizeUser(user: {
  id: string;
  email: string;
  phoneNumber: string | null;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  guardianProfile?: { id: string } | null;
  teacherProfile?: { id: string } | null;
}): SafeUser {
  return {
    id: user.id,
    email: user.email,
    phoneNumber: user.phoneNumber,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    guardianId: user.guardianProfile?.id,
    teacherId: user.teacherProfile?.id,
  };
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_EXPIRATION_DAYS = 7;

/**
 * Authenticates a user by email and password, returning the sanitized user and raw session token.
 */
export async function loginUser(input: {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ user: SafeUser; sessionToken: string }> {
  const normalizedEmail = input.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      guardianProfile: { select: { id: true } },
      teacherProfile: { select: { id: true } },
    },
  });

  // Generic failure for non-existent user
  if (!user) {
    throw new Error('Invalid email or password');
  }

  // Check administrative status
  if (user.status === UserStatus.DEACTIVATED) {
    throw new Error('Account has been deactivated. Please contact administration.');
  }

  if (user.status === UserStatus.SUSPENDED) {
    throw new Error('Account has been suspended. Please contact administration.');
  }

  if (user.status === UserStatus.PENDING_VERIFICATION) {
    throw new Error('Account is pending activation. Please check your email for the activation link.');
  }

  // Check temporary security lockout
  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    const remainingMinutes = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60000);
    throw new Error(`Account is temporarily locked due to repeated failed logins. Try again in ${remainingMinutes} minute(s).`);
  }

  // Verify password
  const isValid = await verifyPassword(input.password, user.passwordHash);
  if (!isValid) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
    const lockedUntil = shouldLock ? new Date(now.getTime() + LOCKOUT_DURATION_MS) : null;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: shouldLock ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        newValues: { attempts, lockedUntil },
      },
    });

    throw new Error('Invalid email or password');
  }

  // Login succeeded: reset counters and update lastLoginAt
  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: now,
    },
  });

  // Create persistent session
  const { rawToken, tokenHash } = generateSecureToken();
  const expiresAt = new Date(now.getTime() + SESSION_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId: user.id,
      sessionTokenHash: tokenHash,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      expiresAt,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      entityType: 'User',
      entityId: user.id,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  });

  return {
    user: sanitizeUser(user),
    sessionToken: rawToken,
  };
}

/**
 * Validates a session token and returns the authenticated user if valid and active.
 */
export async function getCurrentUser(sessionToken: string): Promise<SafeUser | null> {
  if (!sessionToken || typeof sessionToken !== 'string') {
    return null;
  }

  const tokenHash = hashToken(sessionToken);
  const now = new Date();

  const session = await prisma.session.findUnique({
    where: { sessionTokenHash: tokenHash },
    include: {
      user: {
        include: {
          guardianProfile: { select: { id: true } },
          teacherProfile: { select: { id: true } },
        },
      },
    },
  });

  if (!session || session.expiresAt <= now || session.revokedAt !== null) {
    return null;
  }

  if (session.user.status !== UserStatus.ACTIVE) {
    return null;
  }

  return sanitizeUser(session.user);
}

/**
 * Revokes an active session upon user logout.
 */
export async function logoutUser(sessionToken: string, ipAddress?: string): Promise<void> {
  if (!sessionToken) return;

  const tokenHash = hashToken(sessionToken);
  const session = await prisma.session.findUnique({
    where: { sessionTokenHash: tokenHash },
  });

  if (session && !session.revokedAt) {
    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: 'LOGOUT',
        entityType: 'Session',
        entityId: session.id,
        ipAddress,
      },
    });
  }
}

/**
 * Requests a password reset. Anti-enumeration: returns cleanly even if email does not exist.
 */
export async function requestPasswordReset(email: string, ipAddress?: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (!user || user.status === UserStatus.DEACTIVATED) {
    return; // Anti-enumeration: silent return
  }

  const { rawToken, tokenHash } = generateSecureToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.$transaction(async (tx) => {
    await tx.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    // Queue persistent notification in outbox
    const resetUrl = `/auth/reset-password?token=${rawToken}`;
    const rendered = renderPasswordResetEmail({
      recipientName: user.email.split('@')[0],
      resetUrl,
      expiresInMinutes: 60,
    });

    await enqueueNotification(
      {
        idempotencyKey: `SECURITY:PASSWORD_RESET:${user.id}:${tokenHash}`,
        recipientUserId: user.id,
        recipientEmail: user.email,
        channel: 'EMAIL',
        category: NotificationCategory.SECURITY,
        templateName: 'PASSWORD_RESET_REQUEST',
        subject: rendered.subject,
        bodyText: rendered.text,
        htmlBody: rendered.html,
        metadata: { tokenHash, expiresAt: expiresAt.toISOString() },
      },
      tx
    );

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_RESET_REQUESTED',
        entityType: 'PasswordReset',
        entityId: user.id,
        ipAddress,
      },
    });
  });
}

/**
 * Confirms a password reset, updating the password hash, marking the token used,
 * and revoking all active sessions for security.
 */
export async function confirmPasswordReset(input: {
  rawToken: string;
  newPassword: string;
  ipAddress?: string;
}): Promise<void> {
  const validation = validatePasswordStrength(input.newPassword);
  if (!validation.valid) {
    throw new Error(validation.message || 'Invalid password');
  }

  const tokenHash = hashToken(input.rawToken);
  const now = new Date();

  const resetRecord = await prisma.passwordReset.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: { guardianProfile: true, teacherProfile: true },
      },
    },
  });

  if (!resetRecord || resetRecord.usedAt !== null || resetRecord.expiresAt <= now) {
    throw new Error('Invalid or expired password reset link');
  }

  const newPasswordHash = await hashPassword(input.newPassword);

  await prisma.$transaction(async (tx) => {
    // 1. Update user password and clear lockouts
    await tx.user.update({
      where: { id: resetRecord.userId },
      data: {
        passwordHash: newPasswordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // 2. Mark reset token used
    await tx.passwordReset.update({
      where: { id: resetRecord.id },
      data: { usedAt: now },
    });

    // 3. Revoke all active sessions for this user
    await tx.session.updateMany({
      where: {
        userId: resetRecord.userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { revokedAt: now },
    });

    // 4. Audit event
    await tx.auditLog.create({
      data: {
        userId: resetRecord.userId,
        action: 'PASSWORD_RESET_COMPLETED',
        entityType: 'User',
        entityId: resetRecord.userId,
        ipAddress: input.ipAddress,
      },
    });

    // 5. Enqueue security notification: password changed
    const guardian = resetRecord.user.guardianProfile;
    const teacher = resetRecord.user.teacherProfile;
    const recipientName = guardian
      ? `${guardian.firstName} ${guardian.lastName}`.trim()
      : teacher
      ? `${teacher.firstName} ${teacher.lastName}`.trim()
      : resetRecord.user.email;

    const rendered = renderPasswordChangedEmail({
      recipientName,
      changeDateFormatted: now.toLocaleString('en-GB', { timeZone: 'Africa/Lagos' }),
    });

    await enqueueNotification(
      {
        idempotencyKey: `SECURITY:PASSWORD_CHANGED:${resetRecord.userId}:${tokenHash}`,
        recipientUserId: resetRecord.userId,
        recipientEmail: resetRecord.user.email,
        channel: 'EMAIL',
        category: NotificationCategory.SECURITY,
        templateName: 'PASSWORD_CHANGED',
        subject: rendered.subject,
        bodyText: rendered.text,
        htmlBody: rendered.html,
        metadata: { tokenHash },
      },
      tx
    );
  });
}

/**
 * Activates a parent account using a one-time activation token.
 * Verifies email ownership, sets the parent's chosen password, transitions
 * account status from PENDING_VERIFICATION to ACTIVE, and marks token used.
 */
export async function activateAccount(input: {
  rawToken: string;
  newPassword: string;
  ipAddress?: string;
}): Promise<SafeUser> {
  const validation = validatePasswordStrength(input.newPassword);
  if (!validation.valid) {
    throw new Error(validation.message || 'Invalid password');
  }

  const tokenHash = hashToken(input.rawToken);
  const now = new Date();

  const verification = await prisma.emailVerification.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          guardianProfile: { select: { id: true } },
          teacherProfile: { select: { id: true } },
        },
      },
    },
  });

  if (
    !verification ||
    verification.usedAt !== null ||
    verification.expiresAt <= now ||
    verification.tokenType !== VerificationTokenType.ACCOUNT_ACTIVATION
  ) {
    throw new Error('Invalid or expired account activation link');
  }

  const newPasswordHash = await hashPassword(input.newPassword);

  const updatedUser = await prisma.$transaction(async (tx) => {
    // 1. Activate user and set password
    const user = await tx.user.update({
      where: { id: verification.userId },
      data: {
        passwordHash: newPasswordHash,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: now,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      include: {
        guardianProfile: { select: { id: true } },
        teacherProfile: { select: { id: true } },
      },
    });

    // 2. Mark activation token used
    await tx.emailVerification.update({
      where: { id: verification.id },
      data: { usedAt: now },
    });

    // 3. Mark guardian verified if linked
    if (user.guardianProfile) {
      await tx.guardian.update({
        where: { id: user.guardianProfile.id },
        data: { isVerified: true, verifiedAt: now },
      });
    }

    // 4. Audit log
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'ACCOUNT_ACTIVATED',
        entityType: 'User',
        entityId: user.id,
        ipAddress: input.ipAddress,
      },
    });

    return user;
  });

  return sanitizeUser(updatedUser);
}

/**
 * Verifies an email address using an EMAIL_VERIFICATION token.
 */
export async function verifyEmail(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const verification = await prisma.emailVerification.findUnique({
    where: { tokenHash },
  });

  if (!verification || verification.usedAt !== null || verification.expiresAt <= now) {
    throw new Error('Invalid or expired email verification link');
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: verification.userId },
      data: { emailVerifiedAt: now },
    });

    await tx.emailVerification.update({
      where: { id: verification.id },
      data: { usedAt: now },
    });

    await tx.auditLog.create({
      data: {
        userId: verification.userId,
        action: 'EMAIL_VERIFIED',
        entityType: 'User',
        entityId: verification.userId,
      },
    });
  });
}

/**
 * Administratively deactivates a user account.
 */
export async function deactivateUser(userId: string, adminUserId?: string): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { status: UserStatus.DEACTIVATED },
    });

    await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });

    await tx.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'ACCOUNT_DEACTIVATED',
        entityType: 'User',
        entityId: userId,
      },
    });
  });
}

/**
 * Administratively reactivates a user account.
 */
export async function reactivateUser(userId: string, adminUserId?: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { status: UserStatus.ACTIVE, failedLoginAttempts: 0, lockedUntil: null },
    });

    await tx.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'ACCOUNT_REACTIVATED',
        entityType: 'User',
        entityId: userId,
      },
    });
  });
}

/**
 * Manually unlocks a temporarily locked account.
 */
export async function unlockUser(userId: string, adminUserId?: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    await tx.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'ACCOUNT_UNLOCKED',
        entityType: 'User',
        entityId: userId,
      },
    });
  });
}
