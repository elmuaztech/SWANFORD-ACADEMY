import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  activateAccount,
  verifyActivationToken,
  loginUser,
} from '@/lib/auth/service';
import {
  createAdminUser,
  adminInitiatePasswordReset,
  adminChangeUserEmail,
  adminEmergencyAccountRecovery,
} from '@/lib/admin/admin_service';
import { hashPassword, createUnactivatedPasswordSentinel } from '@/lib/auth/password';
import { generateSecureToken } from '@/lib/auth/tokens';
import { UserStatus, RoleCode, VerificationTokenType } from '@prisma/client';

describe('Mandatory Account Activation & Admin Support Controls Integration Tests', () => {
  const superAdminEmail = 'super.admin.support.test@example.com';
  const targetEmail = 'target.user.support.test@example.com';
  const secondaryEmail = 'target.user.new.email@example.com';

  let superAdminActor: any;
  let targetUserId: string;

  async function cleanupTestUsers() {
    const users = await prisma.user.findMany({
      where: {
        email: { in: [superAdminEmail, targetEmail, secondaryEmail, 'provisioned.user.test@example.com'] },
      },
      select: { id: true },
    });
    if (users.length > 0) {
      const userIds = users.map((u) => u.id);
      await prisma.teacherScope.deleteMany({ where: { teacher: { userId: { in: userIds } } } });
      await prisma.teacher.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.emailVerification.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.passwordReset.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.notification.deleteMany({ where: { recipientUserId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  }

  beforeAll(async () => {
    // Clean up any test records
    await cleanupTestUsers();

    // 1. Create a Super Admin actor
    const superAdminRole = await prisma.role.findUnique({
      where: { code: RoleCode.SUPER_ADMIN },
    });

    const superAdminUser = await prisma.user.create({
      data: {
        email: superAdminEmail,
        passwordHash: await hashPassword('SuperAdminPass2026!'),
        status: UserStatus.ACTIVE,
        userRoles: {
          create: { roleId: superAdminRole!.id },
        },
      },
      include: {
        userRoles: { include: { role: true } },
      },
    });

    superAdminActor = {
      id: superAdminUser.id,
      email: superAdminUser.email,
      roles: [RoleCode.SUPER_ADMIN],
      status: UserStatus.ACTIVE,
    };
  });

  afterAll(async () => {
    await cleanupTestUsers();
  });

  it('provisions new account with unmatchable sentinel hash and dispatches activation link', async () => {
    const newUser = await createAdminUser(
      superAdminActor,
      {
        email: 'provisioned.user.test@example.com',
        phoneNumber: '+2348039998877',
        roles: [RoleCode.TEACHER],
        firstName: 'Zainab',
        lastName: 'Umar',
      },
      '127.0.0.1'
    );

    expect(newUser.status).toBe(UserStatus.PENDING_VERIFICATION);
    expect(newUser.email).toBe('provisioned.user.test@example.com');

    // Confirm stored password hash is an unmatchable sentinel
    const dbUser = await prisma.user.findUnique({
      where: { id: newUser.id },
      include: { emailVerifications: true },
    });
    expect(dbUser?.passwordHash).toMatch(/^!UNACTIVATED_ACCOUNT_/);

    // Verify activation token record created
    expect(dbUser?.emailVerifications).toHaveLength(1);
    expect(dbUser?.emailVerifications[0].tokenType).toBe(VerificationTokenType.ACCOUNT_ACTIVATION);
    expect(dbUser?.emailVerifications[0].usedAt).toBeNull();

    // Verify unactivated account cannot log in
    await expect(
      loginUser({ email: 'provisioned.user.test@example.com', password: 'AnyPassword123' })
    ).rejects.toThrow('Account is pending activation');
  });

  it('completes first-time activation by setting private password', async () => {
    const { rawToken, tokenHash } = generateSecureToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const targetUser = await prisma.user.create({
      data: {
        email: targetEmail,
        passwordHash: createUnactivatedPasswordSentinel(),
        status: UserStatus.PENDING_VERIFICATION,
        emailVerifications: {
          create: {
            tokenHash,
            email: targetEmail,
            tokenType: VerificationTokenType.ACCOUNT_ACTIVATION,
            expiresAt,
          },
        },
      },
    });
    targetUserId = targetUser.id;

    // 1. Validate token before display
    const check = await verifyActivationToken(rawToken);
    expect(check.valid).toBe(true);
    expect(check.email).toBe(targetEmail);

    // 2. Reject password < 6 characters
    await expect(
      activateAccount({ rawToken, newPassword: '123' })
    ).rejects.toThrow('at least 6 characters');

    // 3. Activate account with valid password
    const myPassword = 'MySecretPrivatePassword123';
    const activated = await activateAccount({ rawToken, newPassword: myPassword });

    expect(activated.status).toBe(UserStatus.ACTIVE);
    expect(activated.emailVerifiedAt).not.toBeNull();

    // Token is now used and cannot be reused
    const recheck = await verifyActivationToken(rawToken);
    expect(recheck.valid).toBe(false);

    // User can now log in
    const loginRes = await loginUser({ email: targetEmail, password: myPassword });
    expect(loginRes.user.email).toBe(targetEmail);
  });

  it('executes administrative password reset without exposing or setting plaintext password', async () => {
    const result = await adminInitiatePasswordReset(superAdminActor, targetUserId, '127.0.0.1');
    expect(result.success).toBe(true);

    // Verify reset record exists with 24-hour expiry
    const resetRecord = await prisma.passwordReset.findFirst({
      where: { userId: targetUserId, usedAt: null },
    });
    expect(resetRecord).toBeDefined();

    // Verify audit log recorded
    const audit = await prisma.auditLog.findFirst({
      where: {
        entityId: targetUserId,
        action: 'ADMIN_INITIATED_PASSWORD_RESET',
      },
    });
    expect(audit).toBeDefined();
    expect(audit?.userId).toBe(superAdminActor.id);
  });

  it('enforces identity verification, audit logging, dual notification, and new email verification on email change', async () => {
    // 1. Rejects if identityVerified is false
    await expect(
      adminChangeUserEmail(
        superAdminActor,
        targetUserId,
        {
          newEmail: secondaryEmail,
          reason: 'Parent called to update primary email',
          identityVerified: false,
        },
        '127.0.0.1'
      )
    ).rejects.toThrow('Identity verification required');

    // 2. Rejects if reason is empty or too short (< 5 chars)
    await expect(
      adminChangeUserEmail(
        superAdminActor,
        targetUserId,
        {
          newEmail: secondaryEmail,
          reason: 'abc',
          identityVerified: true,
        },
        '127.0.0.1'
      )
    ).rejects.toThrow('minimum 5 characters');

    // 3. Successfully changes email with verified identity and detailed reason
    const changeResult = await adminChangeUserEmail(
      superAdminActor,
      targetUserId,
      {
        newEmail: secondaryEmail,
        reason: 'Parent visited school administration office in person with valid National Identity Card',
        identityVerified: true,
      },
      '127.0.0.1'
    );

    expect(changeResult.success).toBe(true);
    expect(changeResult.oldEmail).toBe(targetEmail);
    expect(changeResult.newEmail).toBe(secondaryEmail);

    // User email in database is updated and emailVerifiedAt is reset to null
    const updatedUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    expect(updatedUser?.email).toBe(secondaryEmail);
    expect(updatedUser?.emailVerifiedAt).toBeNull();

    // Verification token created for the new email
    const newVerification = await prisma.emailVerification.findFirst({
      where: { userId: targetUserId, email: secondaryEmail, usedAt: null },
    });
    expect(newVerification).toBeDefined();
    expect(newVerification?.tokenType).toBe(VerificationTokenType.EMAIL_VERIFICATION);

    // Audit log recorded with old and new email details
    const auditRecord = await prisma.auditLog.findFirst({
      where: {
        entityId: targetUserId,
        action: 'ADMIN_CHANGED_USER_EMAIL',
      },
    });
    expect(auditRecord).toBeDefined();
    expect((auditRecord?.oldValues as any)?.email).toBe(targetEmail);
    expect((auditRecord?.newValues as any)?.email).toBe(secondaryEmail);
    expect((auditRecord?.newValues as any)?.identityVerified).toBe(true);

    // Notifications dispatched: to old email (Security alert) and to new email (Verification)
    const notifications = await prisma.notification.findMany({
      where: { recipientUserId: targetUserId },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });
    expect(notifications.length).toBeGreaterThanOrEqual(2);
    const emailsSentTo = notifications.map((n) => n.recipientEmail);
    expect(emailsSentTo).toContain(targetEmail);
    expect(emailsSentTo).toContain(secondaryEmail);
  });

  it('performs emergency account recovery by unlocking account and clearing failed attempts', async () => {
    // Set user as locked
    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    const recoveryResult = await adminEmergencyAccountRecovery(
      superAdminActor,
      targetUserId,
      {
        reason: 'Parent provided identity proof at front desk after lockout',
        unlockAccount: true,
      },
      '127.0.0.1'
    );

    expect(recoveryResult.success).toBe(true);

    const unlockedUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    expect(unlockedUser?.failedLoginAttempts).toBe(0);
    expect(unlockedUser?.lockedUntil).toBeNull();

    // Verify audit log
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: targetUserId, action: 'ADMIN_EMERGENCY_ACCOUNT_RECOVERY' },
    });
    expect(audit).toBeDefined();
  });
});
