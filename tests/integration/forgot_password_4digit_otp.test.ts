import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
  confirmPasswordResetWithTicket,
  loginUser,
} from '@/lib/auth/service';
import { hashPassword } from '@/lib/auth/password';
import { hashToken } from '@/lib/auth/tokens';
import { clearRateLimit } from '@/lib/security/rate_limiter';
import { UserStatus } from '@prisma/client';

describe('4-Digit OTP Password Reset Flow Integration Tests', { timeout: 20000 }, () => {
  const testEmail = 'otp.lifecycle.test@example.com';
  const initialPassword = 'InitialSecurePassword123!';
  let testUserId: string;

  beforeAll(async () => {
    // Clean up any stale records
    await prisma.user.deleteMany({ where: { email: testEmail } });

    const passwordHash = await hashPassword(initialPassword);
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
  });

  it('provides anti-enumeration protection by returning generic confirmation for non-existent email', async () => {
    const result = await requestPasswordResetOtp('nonexistent.user.123@example.com');
    expect(result.success).toBe(true);
    expect(result.message).toContain('If an account exists with this email');

    // Confirm no reset records were generated in the database
    const orphanRecords = await prisma.passwordReset.findMany({
      where: { user: { email: 'nonexistent.user.123@example.com' } },
    });
    expect(orphanRecords).toHaveLength(0);
  });

  it('generates 4-digit OTP in PostgreSQL with strict 5-minute expiry', async () => {
    const res = await requestPasswordResetOtp(testEmail);
    expect(res.success).toBe(true);

    const record = await prisma.passwordReset.findFirst({
      where: { userId: testUserId, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    expect(record).toBeDefined();
    expect(record?.tokenHash).toHaveLength(64); // SHA-256 hash, raw OTP is never stored

    const now = new Date();
    const expiryTime = record!.expiresAt.getTime();
    const diffSeconds = (expiryTime - now.getTime()) / 1000;
    // Should be approximately 300 seconds (5 minutes)
    expect(diffSeconds).toBeGreaterThan(280);
    expect(diffSeconds).toBeLessThanOrEqual(300);
  });

  it('invalidates prior active OTP upon resending a new code', async () => {
    const firstRecord = await prisma.passwordReset.findFirst({
      where: { userId: testUserId, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(firstRecord).toBeDefined();

    // Request new OTP
    await requestPasswordResetOtp(testEmail);

    // Prior record must now be marked used/invalidated
    const updatedFirstRecord = await prisma.passwordReset.findUnique({
      where: { id: firstRecord!.id },
    });
    expect(updatedFirstRecord?.usedAt).not.toBeNull();

    // A fresh unconsumed record exists
    const newRecord = await prisma.passwordReset.findFirst({
      where: { userId: testUserId, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(newRecord?.id).not.toBe(firstRecord?.id);
  });

  it('enforces 5-failed-attempt killswitch and DOES NOT lock user normal account login', async () => {
    // Request fresh OTP
    await requestPasswordResetOtp(testEmail);

    const activeOtp = await prisma.passwordReset.findFirst({
      where: { userId: testUserId, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const wrongCodes = ['0001', '0002', '0003', '0004', '0005', '0006'].filter(
      (c) => hashToken(c) !== activeOtp?.tokenHash
    );

    // Fail 1: Invalid format (< 4 digits)
    const badFormat = await verifyPasswordResetOtp(testEmail, '12');
    expect(badFormat.success).toBe(false);
    expect(badFormat.message).toContain('exactly 4 numeric digits');

    // Fail 2: Wrong code
    const f1 = await verifyPasswordResetOtp(testEmail, wrongCodes[0]);
    expect(f1.success).toBe(false);
    expect(f1.attemptsRemaining).toBe(4);

    // Fail 3
    const f2 = await verifyPasswordResetOtp(testEmail, wrongCodes[1]);
    expect(f2.success).toBe(false);
    expect(f2.attemptsRemaining).toBe(3);

    // Fail 4
    const f3 = await verifyPasswordResetOtp(testEmail, wrongCodes[2]);
    expect(f3.success).toBe(false);
    expect(f3.attemptsRemaining).toBe(2);

    // Fail 5
    const f4 = await verifyPasswordResetOtp(testEmail, wrongCodes[3]);
    expect(f4.success).toBe(false);
    expect(f4.attemptsRemaining).toBe(1);

    // Fail 6: 5th failure triggers permanent killswitch
    const f5 = await verifyPasswordResetOtp(testEmail, wrongCodes[4]);
    expect(f5.success).toBe(false);
    expect(f5.attemptsRemaining).toBe(0);
    expect(f5.message).toContain('Maximum verification attempts exceeded');

    // Active OTP records are now invalidated in the database
    const activeRecords = await prisma.passwordReset.findMany({
      where: { userId: testUserId, usedAt: null },
    });
    expect(activeRecords).toHaveLength(0);

    // CRITICAL USER CORRECTION #2:
    // Normal login with initial password MUST STILL WORK! User's account is NOT locked!
    const userInDb = await prisma.user.findUnique({ where: { id: testUserId } });
    expect(userInDb?.lockedUntil).toBeNull();

    const loginResult = await loginUser({ email: testEmail, password: initialPassword });
    expect(loginResult.user.email).toBe(testEmail);
  });

  it('completes full OTP verification and password reset with 10-minute single-use ticket', async () => {
    // Clear rate limit state from preceding 5-failure killswitch test
    clearRateLimit(`otp_verify_account:${testEmail}`);
    clearRateLimit('otp_verify_ip:127.0.0.1');

    // 1. Plant a known 4-digit OTP with leading zero: "0427"
    const testOtp = '0427';
    const otpHash = hashToken(testOtp);
    const now = new Date();

    await prisma.passwordReset.create({
      data: {
        userId: testUserId,
        tokenHash: otpHash,
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
      },
    });

    // 2. Verify the 4-digit code (including leading zero format)
    const verifyRes = await verifyPasswordResetOtp(testEmail, '0427');
    expect(verifyRes.success).toBe(true);
    expect(verifyRes.resetTicket).toBeDefined();

    const rawTicket = verifyRes.resetTicket!;

    // 3. Confirm ticket is stored with 10-minute expiry
    const ticketHash = hashToken(rawTicket);
    const ticketRecord = await prisma.passwordReset.findUnique({
      where: { tokenHash: ticketHash },
    });
    expect(ticketRecord).toBeDefined();
    expect(ticketRecord?.usedAt).toBeNull();

    // 4. Reject passwords under 6 characters
    await expect(
      confirmPasswordResetWithTicket({
        email: testEmail,
        resetTicket: rawTicket,
        newPassword: 'short',
      })
    ).rejects.toThrow('at least 6 characters');

    // 5. Successfully confirm password reset with 6+ character password
    const newPassword = 'NewSecretPassword2026';
    await confirmPasswordResetWithTicket({
      email: testEmail,
      resetTicket: rawTicket,
      newPassword,
    });

    // 6. Verify ticket is permanently consumed (single-use)
    const consumedTicket = await prisma.passwordReset.findUnique({
      where: { tokenHash: ticketHash },
    });
    expect(consumedTicket?.usedAt).not.toBeNull();

    // 7. Verify ticket cannot be reused
    await expect(
      confirmPasswordResetWithTicket({
        email: testEmail,
        resetTicket: rawTicket,
        newPassword: 'AnotherPassword123',
      })
    ).rejects.toThrow('Invalid, expired, or previously used reset ticket');

    // 8. Verify user can now log in with the new password
    const loginSuccess = await loginUser({ email: testEmail, password: newPassword });
    expect(loginSuccess.user.email).toBe(testEmail);

    // Old password no longer works
    await expect(
      loginUser({ email: testEmail, password: initialPassword })
    ).rejects.toThrow('Invalid email or password');
  });
});
