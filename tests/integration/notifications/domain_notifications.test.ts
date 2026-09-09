import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { requestPasswordReset, confirmPasswordReset } from '@/lib/auth/service';
import { hashPassword } from '@/lib/auth/password';
import { UserStatus } from '@prisma/client';

describe('Stage 10 Integration: Auth Domain Notifications', () => {
  const testEmail = `auth.test.${Date.now()}@swanford.test`;
  let userId: string;

  afterEach(async () => {
    await prisma.notification.deleteMany({
      where: { recipientEmail: testEmail },
    });
    await prisma.auditLog.deleteMany({
      where: { userId },
    });
    await prisma.passwordReset.deleteMany({
      where: { userId },
    });
    await prisma.session.deleteMany({
      where: { userId },
    });
    await prisma.user.deleteMany({
      where: { id: userId },
    });
  });

  it('enqueues password reset request and password changed notifications during auth lifecycle', async () => {
    const pw = await hashPassword('InitialPass123!@#');
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash: pw,
        status: UserStatus.ACTIVE,
      },
    });
    userId = user.id;

    // 1. Request password reset
    await requestPasswordReset(testEmail);

    // Verify outbox has SECURITY:PASSWORD_RESET notification
    const resetNotifs = await prisma.notification.findMany({
      where: {
        recipientEmail: testEmail,
        templateName: 'PASSWORD_RESET_REQUEST',
      },
    });
    expect(resetNotifs).toHaveLength(1);
    expect(resetNotifs[0].idempotencyKey).toContain(`SECURITY:PASSWORD_RESET:${user.id}`);
    expect(resetNotifs[0].category).toBe('SECURITY');

    // 2. Fetch the raw token from the reset record to simulate the user clicking the link
    const resetRecord = await prisma.passwordReset.findFirst({
      where: { userId: user.id, usedAt: null },
    });
    expect(resetRecord).not.toBeNull();

    // In a real flow, the user has the raw token sent in their email
    // Here we test confirmPasswordReset by verifying token usage
    // Let's create a known raw token
    const testToken = `test-raw-token-${Date.now()}`;
    const crypto = await import('crypto');
    const knownHash = crypto.createHash('sha256').update(testToken).digest('hex');

    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: knownHash,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    await confirmPasswordReset({
      rawToken: testToken,
      newPassword: 'NewSecurePassword456!@#',
    });

    // Verify outbox has SECURITY:PASSWORD_CHANGED notification
    const changedNotifs = await prisma.notification.findMany({
      where: {
        recipientEmail: testEmail,
        templateName: 'PASSWORD_CHANGED',
      },
    });
    expect(changedNotifs).toHaveLength(1);
    expect(changedNotifs[0].idempotencyKey).toContain(`SECURITY:PASSWORD_CHANGED:${user.id}`);
    expect(changedNotifs[0].category).toBe('SECURITY');
  });
});
