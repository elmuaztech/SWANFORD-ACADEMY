import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  loginUser,
  getCurrentUser,
  logoutUser,
  requestPasswordReset,
  confirmPasswordReset,
  activateAccount,
  deactivateUser,
  reactivateUser,
  unlockUser,
} from '@/lib/auth/service';
import { generateSecureToken, hashToken } from '@/lib/auth/tokens';
import { createUnactivatedPasswordSentinel } from '@/lib/auth/password';
import { UserStatus, VerificationTokenType, NotificationStatus } from '@prisma/client';

describe('Auth & Account Lifecycle Integration Tests', () => {
  const testEmail = 'parent.auth.test@example.com';
  let userId: string;
  let rawActivationToken: string;

  beforeAll(async () => {
    // Clean up any prior test artifacts
    await prisma.user.deleteMany({ where: { email: testEmail } });

    // 1. Simulate unactivated parent account created via bulk enrollment
    const { rawToken, tokenHash } = generateSecureToken();
    rawActivationToken = rawToken;

    const user = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash: createUnactivatedPasswordSentinel(),
        status: UserStatus.PENDING_VERIFICATION,
        emailVerifications: {
          create: {
            tokenHash,
            email: testEmail,
            tokenType: VerificationTokenType.ACCOUNT_ACTIVATION,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        },
      },
    });

    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
  });

  it('rejects login attempts on unactivated PENDING_VERIFICATION accounts', async () => {
    await expect(
      loginUser({ email: testEmail, password: 'AnyPassword123!' })
    ).rejects.toThrow('Account is pending activation');
  });

  it('activates parent account with secure activation token and private password', async () => {
    const activatedUser = await activateAccount({
      rawToken: rawActivationToken,
      newPassword: 'MyNewSecretPassword2026!',
    });

    expect(activatedUser.status).toBe(UserStatus.ACTIVE);
    expect(activatedUser.emailVerifiedAt).not.toBeNull();

    // Verify token marked used
    const tokenRecord = await prisma.emailVerification.findFirst({
      where: { userId },
    });
    expect(tokenRecord?.usedAt).not.toBeNull();

    // Reusing the same activation token must fail
    await expect(
      activateAccount({
        rawToken: rawActivationToken,
        newPassword: 'AnotherPassword123!',
      })
    ).rejects.toThrow('Invalid or expired account activation link');
  });

  it('successfully logs in activated user and establishes persistent session', async () => {
    const loginResult = await loginUser({
      email: testEmail,
      password: 'MyNewSecretPassword2026!',
      ipAddress: '127.0.0.1',
      userAgent: 'TestRunner/1.0',
    });

    expect(loginResult.user.id).toBe(userId);
    expect(loginResult.sessionToken).toBeDefined();

    // Verify session lookup works via getCurrentUser
    const sessionUser = await getCurrentUser(loginResult.sessionToken);
    expect(sessionUser).toBeDefined();
    expect(sessionUser?.id).toBe(userId);

    // Verify lastLoginAt updated in database
    const dbUser = await prisma.user.findUnique({ where: { id: userId } });
    expect(dbUser?.lastLoginAt).not.toBeNull();

    // Verify logout revokes the session
    await logoutUser(loginResult.sessionToken);
    const loggedOutUser = await getCurrentUser(loginResult.sessionToken);
    expect(loggedOutUser).toBeNull();
  });

  it('enforces temporary lockout after 5 consecutive failed login attempts', async () => {
    // 4 failed attempts should fail normally
    for (let i = 0; i < 4; i++) {
      await expect(
        loginUser({ email: testEmail, password: 'WrongPassword' })
      ).rejects.toThrow('Invalid email or password');
    }

    let dbUser = await prisma.user.findUnique({ where: { id: userId } });
    expect(dbUser?.failedLoginAttempts).toBe(4);
    expect(dbUser?.lockedUntil).toBeNull();

    // 5th failed attempt triggers lockout
    await expect(
      loginUser({ email: testEmail, password: 'WrongPassword' })
    ).rejects.toThrow('Invalid email or password');

    dbUser = await prisma.user.findUnique({ where: { id: userId } });
    expect(dbUser?.failedLoginAttempts).toBe(5);
    expect(dbUser?.lockedUntil).not.toBeNull();
    expect(dbUser!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    // 6th attempt is blocked by lockout
    await expect(
      loginUser({ email: testEmail, password: 'MyNewSecretPassword2026!' })
    ).rejects.toThrow(/temporarily locked/);

    // Administrative unlock clears the lockout
    await unlockUser(userId);
    dbUser = await prisma.user.findUnique({ where: { id: userId } });
    expect(dbUser?.lockedUntil).toBeNull();
    expect(dbUser?.failedLoginAttempts).toBe(0);
  });

  it('handles password reset request and confirmation with session invalidation', async () => {
    // 1. Establish an active session first
    const { sessionToken } = await loginUser({
      email: testEmail,
      password: 'MyNewSecretPassword2026!',
    });
    expect(await getCurrentUser(sessionToken)).not.toBeNull();

    // 2. Request password reset
    await requestPasswordReset(testEmail);

    // Retrieve the reset record and outbox notification
    const resetRecord = await prisma.passwordReset.findFirst({
      where: { userId, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(resetRecord).toBeDefined();

    const notification = await prisma.notification.findFirst({
      where: { recipientEmail: testEmail, templateName: 'PASSWORD_RESET_REQUEST' },
      orderBy: { createdAt: 'desc' },
    });
    expect(notification).toBeDefined();
    expect(notification?.status).toBe(NotificationStatus.PENDING);

    // Extract raw token from notification body text
    const tokenMatch = notification?.bodyText.match(/token=([a-f0-9]+)/);
    expect(tokenMatch).toBeDefined();
    const rawResetToken = tokenMatch![1];

    // Verify tokenHash matches
    expect(hashToken(rawResetToken)).toBe(resetRecord!.tokenHash);

    // 3. Confirm password reset with new password
    await confirmPasswordReset({
      rawToken: rawResetToken,
      newPassword: 'BrandNewPassword2026!',
    });

    // 4. Verify previous session was invalidated
    const postResetUser = await getCurrentUser(sessionToken);
    expect(postResetUser).toBeNull();

    // 5. Verify login with new password succeeds
    const newLogin = await loginUser({
      email: testEmail,
      password: 'BrandNewPassword2026!',
    });
    expect(newLogin.user.id).toBe(userId);
    await logoutUser(newLogin.sessionToken);
  });

  it('administrative deactivation revokes sessions and blocks login without deleting data', async () => {
    const { sessionToken } = await loginUser({
      email: testEmail,
      password: 'BrandNewPassword2026!',
    });

    // Deactivate user
    await deactivateUser(userId);

    // Session is immediately dead
    expect(await getCurrentUser(sessionToken)).toBeNull();

    // New login is blocked
    await expect(
      loginUser({ email: testEmail, password: 'BrandNewPassword2026!' })
    ).rejects.toThrow('Account has been deactivated');

    // Reactivate user
    await reactivateUser(userId);

    // Login succeeds again
    const reactivatedLogin = await loginUser({
      email: testEmail,
      password: 'BrandNewPassword2026!',
    });
    expect(reactivatedLogin.user.id).toBe(userId);
    await logoutUser(reactivatedLogin.sessionToken);
  });

  it('verifies notification outbox support for RETRYABLE status on delivery failure', async () => {
    // Create an outbox notification
    const notification = await prisma.notification.create({
      data: {
        recipientUserId: userId,
        recipientEmail: testEmail,
        channel: 'EMAIL',
        templateName: 'TEST_NOTIFICATION',
        subject: 'Test Outbox',
        bodyText: 'Testing outbox failure decoupling',
        status: NotificationStatus.PENDING,
        attempts: 0,
        maxAttempts: 3,
      },
    });

    // Simulate SMTP network failure: increment attempt, set RETRYABLE status with nextRetryAt
    const nextRetry = new Date(Date.now() + 5 * 60 * 1000); // 5 mins later
    const updated = await prisma.notification.update({
      where: { id: notification.id },
      data: {
        attempts: 1,
        status: NotificationStatus.RETRYABLE,
        nextRetryAt: nextRetry,
        errorMessage: 'Connection timed out to smtp.mailgun.org:587',
      },
    });

    expect(updated.status).toBe(NotificationStatus.RETRYABLE);
    expect(updated.attempts).toBe(1);
    expect(updated.nextRetryAt).toBeDefined();
    expect(updated.errorMessage).toContain('Connection timed out');
  });
});
