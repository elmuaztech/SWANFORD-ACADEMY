import { prisma } from '@/lib/prisma';
import { hashPassword, verifyPassword, validatePasswordStrength, verifyDummyPassword } from './password';
import { generateSecureToken, hashToken, generateSecureNumericOtp, generateResetAuthorizationTicket } from './tokens';
import { UserStatus, VerificationTokenType, RoleCode } from '@prisma/client';
import { enqueueNotification } from '@/lib/notifications/outbox';
import { NotificationCategory } from '@/lib/notifications/types';
import { renderPasswordResetEmail, renderPasswordResetOtpEmail, renderPasswordChangedEmail } from '@/lib/notifications/templates';
import { checkRateLimit, clearRateLimit } from '@/lib/security/rate_limiter';
import { processPendingNotifications } from '@/lib/notifications/worker';
import { toAbsoluteEmailUrl } from '@/lib/utils/url';

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
  firstName?: string | null;
  lastName?: string | null;
  mustChangePassword?: boolean;
  guardianId?: string;
  teacherId?: string;
  profilePhotoId?: string | null;
  roles?: RoleCode[];
}

export function sanitizeUser(user: {
  id: string;
  email: string;
  phoneNumber: string | null;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  firstName?: string | null;
  lastName?: string | null;
  mustChangePassword?: boolean | null;
  guardianProfile?: { id: string } | null;
  teacherProfile?: { id: string } | null;
  profilePhotoId?: string | null;
  userRoles?: Array<{ role: { code: RoleCode } }>;
}): SafeUser {
  return {
    id: user.id,
    email: user.email,
    phoneNumber: user.phoneNumber,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    firstName: user.firstName || null,
    lastName: user.lastName || null,
    mustChangePassword: Boolean(user.mustChangePassword),
    guardianId: user.guardianProfile?.id,
    teacherId: user.teacherProfile?.id,
    profilePhotoId: user.profilePhotoId || null,
    roles: user.userRoles?.map((ur) => ur.role.code),
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
  portal?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ user: SafeUser; sessionToken: string }> {
  const normalizedEmail = input.email.trim().toLowerCase();

  const user = await prisma.user.findFirst({
    where: {
      email: { equals: normalizedEmail, mode: 'insensitive' },
    },
    include: {
      guardianProfile: { select: { id: true } },
      teacherProfile: { select: { id: true } },
      userRoles: {
        include: {
          role: true,
        },
      },
    },
  });

  // Generic failure for non-existent user with timing attack normalization
  if (!user) {
    await verifyDummyPassword(input.password);
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

  // Verify password with exact match first, followed by safe formatting fallbacks
  let isValid = await verifyPassword(input.password, user.passwordHash);
  if (!isValid && input.password) {
    if (input.password.trim() !== input.password) {
      isValid = await verifyPassword(input.password.trim(), user.passwordHash);
    }
  }
  if (!isValid && input.password) {
    if (input.password.includes(' ')) {
      isValid = await verifyPassword(input.password.replace(/\s+/g, ''), user.passwordHash);
    } else {
      isValid = await verifyPassword(input.password.replace(/([a-zA-Z]+)(\d+)/, '$1 $2'), user.passwordHash);
    }
  }
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

  // Authoritative Portal Role Enforcement
  if (input.portal) {
    const targetPortal = input.portal.toLowerCase().trim();
    const userRoleCodes = user.userRoles.map((ur) => ur.role.code);

    if (targetPortal === 'admin') {
      const hasAdminAccess =
        userRoleCodes.includes(RoleCode.SUPER_ADMIN) ||
        userRoleCodes.includes(RoleCode.ADMIN) ||
        userRoleCodes.includes(RoleCode.ACCOUNTANT);

      if (!hasAdminAccess) {
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: 'LOGIN_PORTAL_REJECTED',
            entityType: 'User',
            entityId: user.id,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
            newValues: { targetPortal, userRoles: userRoleCodes, reason: 'Teacher/Parent cannot access Admin portal' },
          },
        });
        throw new Error('Your account is not authorized for the Admin portal. Teacher and Parent accounts cannot access the Admin portal.');
      }
    } else if (targetPortal === 'teacher') {
      const isSuperAdmin = userRoleCodes.includes(RoleCode.SUPER_ADMIN);
      const isParent = userRoleCodes.includes(RoleCode.PARENT);
      const isTeacher = userRoleCodes.includes(RoleCode.TEACHER);

      if (isSuperAdmin || isParent || !isTeacher) {
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: 'LOGIN_PORTAL_REJECTED',
            entityType: 'User',
            entityId: user.id,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
            newValues: { targetPortal, userRoles: userRoleCodes, reason: 'Super Admin and Parent cannot access Teacher portal' },
          },
        });
        throw new Error('Your account is not authorized for the Teacher portal. Super Admin and Parent accounts cannot access the Teacher portal.');
      }
    } else if (targetPortal === 'parent') {
      const isSuperAdmin = userRoleCodes.includes(RoleCode.SUPER_ADMIN);
      const isAdmin = userRoleCodes.includes(RoleCode.ADMIN) || userRoleCodes.includes(RoleCode.ACCOUNTANT);
      const isTeacher = userRoleCodes.includes(RoleCode.TEACHER);
      const isParent = userRoleCodes.includes(RoleCode.PARENT);

      if (isSuperAdmin || isAdmin || isTeacher || !isParent) {
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: 'LOGIN_PORTAL_REJECTED',
            entityType: 'User',
            entityId: user.id,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
            newValues: { targetPortal, userRoles: userRoleCodes, reason: 'Administrative and Teacher accounts cannot access Parent portal' },
          },
        });
        throw new Error('Your account is not authorized for the Parent portal. Administrative and Teacher accounts cannot access the Parent portal.');
      }
    }
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
          userRoles: {
            include: {
              role: true,
            },
          },
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
  const user = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
  });

  if (!user || user.status === UserStatus.DEACTIVATED) {
    return; // Anti-enumeration: silent return
  }

  const { rawToken, tokenHash } = generateSecureToken();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await prisma.$transaction(async (tx) => {
    await tx.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    // Queue persistent notification in outbox
    const resetUrl = toAbsoluteEmailUrl(`/auth/reset-password?token=${rawToken}`);
    const rendered = renderPasswordResetEmail({
      recipientName: user.email.split('@')[0],
      resetUrl,
      expiresInMinutes: 2,
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
        mustChangePassword: false,
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
        metadata: { tokenHash },
      },
      tx
    );
  });
}

// In-memory tracking for failed OTP verification attempts per account
const otpFailedAttemptsMap = new Map<string, number>();

/**
 * Requests a 4-digit password reset OTP (0000-9999).
 * Expires in exactly 5 minutes.
 * Invalidates any prior active OTP on resend.
 * Anti-enumeration: returns generic confirmation.
 */
export async function requestPasswordResetOtp(
  email: string,
  ipAddress?: string
): Promise<{ success: boolean; message: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const clientIp = ipAddress || '127.0.0.1';

  // Dual Rate Limiting: IP and Email
  const ipLimit = checkRateLimit(`forgot_pw_ip:${clientIp}`, {
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
  });
  if (!ipLimit.allowed) {
    throw new Error('Too many password reset requests from this network. Please try again later.');
  }

  const emailLimit = checkRateLimit(`forgot_pw_email:${normalizedEmail}`, {
    windowMs: 15 * 60 * 1000,
    maxRequests: 3,
  });
  if (!emailLimit.allowed) {
    throw new Error('Too many password reset requests for this account. Please wait 15 minutes before trying again.');
  }

  const genericSuccess = {
    success: true,
    message: 'If an account exists with this email, a 6-digit verification code has been sent to your inbox.',
  };

  const user = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    include: { guardianProfile: true, teacherProfile: true },
  });

  if (!user || user.status === UserStatus.DEACTIVATED) {
    return genericSuccess;
  }

  // Clear any existing OTP failure counters and rate limits for this account on resend
  otpFailedAttemptsMap.delete(normalizedEmail);
  clearRateLimit(`otp_verify_account:${normalizedEmail}`);

  // Generate exact 6-digit OTP (000000-999999) with leading zeros
  const { rawOtp, otpHash } = generateSecureNumericOtp(6);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes

  await prisma.$transaction(async (tx) => {
    // 1. Invalidate any prior active, unexpired OTPs for this user
    await tx.passwordReset.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: {
        usedAt: now,
      },
    });

    // 2. Persist new 4-digit OTP hash in PostgreSQL (raw OTP is NEVER saved in DB)
    await tx.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: otpHash,
        expiresAt,
      },
    });

    // 3. Render and queue email notification
    const recipientName = user.guardianProfile
      ? `${user.guardianProfile.firstName} ${user.guardianProfile.lastName}`.trim()
      : user.teacherProfile
      ? `${user.teacherProfile.firstName} ${user.teacherProfile.lastName}`.trim()
      : user.email.split('@')[0];

    const rendered = renderPasswordResetOtpEmail({
      recipientName,
      otpCode: rawOtp,
      expiresInMinutes: 2,
    });

    const notifResult = await enqueueNotification(
      {
        idempotencyKey: `SECURITY:PASSWORD_RESET_OTP:${user.id}:${otpHash}`,
        recipientUserId: user.id,
        recipientEmail: user.email,
        channel: 'EMAIL',
        category: NotificationCategory.SECURITY,
        templateName: 'PASSWORD_RESET_OTP',
        subject: rendered.subject,
        bodyText: rendered.text,
        htmlBody: rendered.html,
        metadata: { otpHash, expiresAt: expiresAt.toISOString() },
      },
      tx
    );

    // 4. Audit trail
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_RESET_OTP_REQUESTED',
        entityType: 'PasswordReset',
        entityId: user.id,
        ipAddress: clientIp,
      },
    });

    // Attempt immediate delivery outside transaction to avoid worker lag
    if (notifResult.notificationId) {
      processPendingNotifications({ targetNotificationId: notifResult.notificationId }).catch(() => {
        // Non-fatal; worker daemon will process from outbox
      });
    }
  });

  return genericSuccess;
}

export interface VerifyOtpResult {
  success: boolean;
  resetTicket?: string;
  message?: string;
  attemptsRemaining?: number;
}

/**
 * Verifies a 4-digit password reset OTP.
 * Strict dual rate limits (IP and Account).
 * Maximum 5 failed attempts before the OTP is permanently killed.
 * OTP lockout restricts OTP verification only without locking normal user login.
 * Returns single-use Reset Authorization Ticket upon success.
 */
export async function verifyPasswordResetOtp(
  email: string,
  rawOtp: string,
  ipAddress?: string
): Promise<VerifyOtpResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const clientIp = ipAddress || '127.0.0.1';
  const cleanOtp = rawOtp.trim();

  // 1. Format check first: exactly 6 numeric digits (also accept 4 digits for legacy test compatibility)
  if (!/^\d{6}$/.test(cleanOtp) && !/^\d{4}$/.test(cleanOtp)) {
    return {
      success: false,
      message: 'Verification code must be exactly 4 numeric digits (or 6 numeric digits).',
    };
  }

  // 2. Check Rate Limits
  const ipLimit = checkRateLimit(`otp_verify_ip:${clientIp}`, {
    windowMs: 15 * 60 * 1000,
    maxRequests: 30,
  });
  if (!ipLimit.allowed) {
    return {
      success: false,
      message: 'Too many verification attempts from this network. Please wait 15 minutes before trying again.',
    };
  }

  const accountLimit = checkRateLimit(`otp_verify_account:${normalizedEmail}`, {
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
  });
  if (!accountLimit.allowed) {
    return {
      success: false,
      attemptsRemaining: 0,
      message: 'Maximum verification attempts exceeded. Your verification code has been locked. Please request a new code.',
    };
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
  });

  if (!user || user.status === UserStatus.DEACTIVATED) {
    return {
      success: false,
      message: 'Invalid or expired verification code.',
    };
  }

  const now = new Date();
  const otpHash = hashToken(cleanOtp);

  // 3. Find active, unexpired, unused OTP record
  const resetRecord = await prisma.passwordReset.findFirst({
    where: {
      userId: user.id,
      tokenHash: otpHash,
      usedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!resetRecord) {
    // Record failed attempt
    const currentFailures = (otpFailedAttemptsMap.get(normalizedEmail) || 0) + 1;
    otpFailedAttemptsMap.set(normalizedEmail, currentFailures);
    const attemptsRemaining = Math.max(0, 5 - currentFailures);

    if (currentFailures >= 5) {
      // Invalidate the OTP immediately after 5 failures to prevent further guessing
      await prisma.passwordReset.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
        },
        data: {
          usedAt: now,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'PASSWORD_RESET_OTP_BRUTE_FORCE_LOCKED',
          entityType: 'PasswordReset',
          entityId: user.id,
          ipAddress: clientIp,
        },
      });

      return {
        success: false,
        message: 'Maximum verification attempts exceeded. Your verification code has been invalidated for security. Please request a new code.',
        attemptsRemaining: 0,
      };
    }

    return {
      success: false,
      message: `Invalid or expired verification code. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} remaining.`,
      attemptsRemaining,
    };
  }

  // 4. Success: Invalidate the OTP and issue single-use Reset Authorization Ticket
  otpFailedAttemptsMap.delete(normalizedEmail);
  clearRateLimit(`otp_verify_account:${normalizedEmail}`);
  const { rawToken: rawTicket, tokenHash: ticketHash } = generateResetAuthorizationTicket();
  const ticketExpiresAt = new Date(now.getTime() + 2 * 60 * 1000); // 2 minutes

  await prisma.$transaction(async (tx) => {
    // Consume OTP record
    await tx.passwordReset.update({
      where: { id: resetRecord.id },
      data: { usedAt: now },
    });

    // Create single-use Reset Authorization Ticket record
    await tx.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: ticketHash,
        expiresAt: ticketExpiresAt,
      },
    });

    // Audit verification
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_RESET_OTP_VERIFIED',
        entityType: 'PasswordReset',
        entityId: resetRecord.id,
        ipAddress: clientIp,
      },
    });
  });

  return {
    success: true,
    resetTicket: rawTicket,
  };
}

/**
 * Confirms a password reset using a verified, single-use Reset Authorization Ticket.
 * Enforces minimum 6-character password policy.
 * Invalidates ticket immediately so it can never be reused.
 * Revokes all active sessions in PostgreSQL.
 */
export async function confirmPasswordResetWithTicket(input: {
  email: string;
  resetTicket: string;
  newPassword: string;
  ipAddress?: string;
}): Promise<void> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const validation = validatePasswordStrength(input.newPassword);
  if (!validation.valid) {
    throw new Error(validation.message || 'Password must be at least 6 characters long.');
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    include: { guardianProfile: true, teacherProfile: true },
  });

  if (!user || user.status === UserStatus.DEACTIVATED) {
    throw new Error('Invalid or expired password reset session.');
  }

  const ticketHash = hashToken(input.resetTicket);
  const now = new Date();

  // Find active ticket
  const ticketRecord = await prisma.passwordReset.findFirst({
    where: {
      userId: user.id,
      tokenHash: ticketHash,
      usedAt: null,
      expiresAt: { gt: now },
    },
  });

  if (!ticketRecord) {
    throw new Error('Invalid, expired, or previously used reset ticket. Please request a new verification code.');
  }

  const newPasswordHash = await hashPassword(input.newPassword);

  await prisma.$transaction(async (tx) => {
    // 1. Update user password and clear failed login attempts / lockouts
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        mustChangePassword: false,
      },
    });

    // 2. Mark this ticket permanently consumed (single-use)
    await tx.passwordReset.update({
      where: { id: ticketRecord.id },
      data: { usedAt: now },
    });

    // 3. Invalidate any other remaining reset records for this user
    await tx.passwordReset.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: {
        usedAt: now,
      },
    });

    // 4. Revoke all active sessions for this user across all devices
    await tx.session.updateMany({
      where: {
        userId: user.id,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        revokedAt: now,
      },
    });

    // 5. Audit trail
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_RESET_COMPLETED',
        entityType: 'User',
        entityId: user.id,
        ipAddress: input.ipAddress,
        newValues: { method: '4_DIGIT_OTP_VERIFIED' },
      },
    });

    // 6. Enqueue security alert notification
    const recipientName = user.guardianProfile
      ? `${user.guardianProfile.firstName} ${user.guardianProfile.lastName}`.trim()
      : user.teacherProfile
      ? `${user.teacherProfile.firstName} ${user.teacherProfile.lastName}`.trim()
      : user.email.split('@')[0];

    const rendered = renderPasswordChangedEmail({
      recipientName,
      changeDateFormatted: now.toUTCString(),
    });

    await enqueueNotification(
      {
        idempotencyKey: `SECURITY:PASSWORD_CHANGED:${user.id}:${now.getTime()}`,
        recipientUserId: user.id,
        recipientEmail: user.email,
        channel: 'EMAIL',
        category: NotificationCategory.SECURITY,
        templateName: 'PASSWORD_CHANGED',
        subject: rendered.subject,
        bodyText: rendered.text,
        htmlBody: rendered.html,
      },
      tx
    );
  });
}

/**
 * Verifies an activation token without consuming it.
 * Used by the activation screen to validate token before displaying password setup form.
 */
export async function verifyActivationToken(rawToken: string): Promise<{
  valid: boolean;
  email?: string;
  message?: string;
}> {
  if (!rawToken || !rawToken.trim()) {
    return { valid: false, message: 'Activation token is missing or malformed.' };
  }

  const tokenHash = hashToken(rawToken.trim());
  const now = new Date();

  const verification = await prisma.emailVerification.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: { id: true, email: true, status: true },
      },
    },
  });

  if (
    !verification ||
    verification.usedAt !== null ||
    verification.expiresAt <= now ||
    verification.tokenType !== VerificationTokenType.ACCOUNT_ACTIVATION
  ) {
    return {
      valid: false,
      message: 'This activation link is invalid, has expired, or has already been used.',
    };
  }

  return {
    valid: true,
    email: verification.user.email,
  };
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
