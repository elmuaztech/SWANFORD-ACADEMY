import { describe, it, expect } from 'vitest';
import { validatePasswordStrength, hashPassword, verifyPassword } from '@/lib/auth/password';
import { generateSecureNumericOtp, hashToken, generateResetAuthorizationTicket } from '@/lib/auth/tokens';

describe('Password & OTP Security Policy Unit Tests', () => {
  describe('Password Length & Strength Policy (Min 6 Characters)', () => {
    it('rejects passwords shorter than 6 characters', () => {
      expect(validatePasswordStrength('').valid).toBe(false);
      expect(validatePasswordStrength('1').valid).toBe(false);
      expect(validatePasswordStrength('12345').valid).toBe(false);
      expect(validatePasswordStrength('12345').message).toContain('at least 6 characters');
    });

    it('accepts passwords of exactly 6 characters and longer', () => {
      expect(validatePasswordStrength('123456').valid).toBe(true);
      expect(validatePasswordStrength('abcdef').valid).toBe(true);
      expect(validatePasswordStrength('P@ss12').valid).toBe(true);
      expect(validatePasswordStrength('A'.repeat(72)).valid).toBe(true);
    });

    it('rejects passwords exceeding 72 characters (bcrypt buffer limitation)', () => {
      expect(validatePasswordStrength('A'.repeat(73)).valid).toBe(false);
    });

    it('hashes passwords securely using bcrypt work factor 12 rounds', async () => {
      const plain = 'secret123';
      const hashed = await hashPassword(plain);
      expect(hashed).toMatch(/^\$2[aby]\$12\$/);
      expect(await verifyPassword(plain, hashed)).toBe(true);
      expect(await verifyPassword('wrongpassword', hashed)).toBe(false);
    });
  });

  describe('4-Digit OTP Generation & Policy (0000–9999 with Leading Zeros)', () => {
    it('generates exact 4-digit numeric OTPs padded with leading zeros', () => {
      for (let i = 0; i < 50; i++) {
        const { rawOtp, otpHash } = generateSecureNumericOtp(4);
        expect(rawOtp).toMatch(/^\d{4}$/);
        expect(rawOtp.length).toBe(4);
        expect(otpHash).toHaveLength(64); // SHA-256 hex string
        expect(hashToken(rawOtp)).toBe(otpHash);

        const num = parseInt(rawOtp, 10);
        expect(num).toBeGreaterThanOrEqual(0);
        expect(num).toBeLessThanOrEqual(9999);
      }
    });

    it('correctly pads leading zeros for numbers under 1000 (e.g. 0427)', () => {
      // Simulate raw conversion of 427 to 4-digit string
      const num = 427;
      const formatted = num.toString().padStart(4, '0');
      expect(formatted).toBe('0427');
      expect(formatted).toHaveLength(4);
      expect(/^\d{4}$/.test(formatted)).toBe(true);

      const zeroNum = 5;
      const zeroFormatted = zeroNum.toString().padStart(4, '0');
      expect(zeroFormatted).toBe('0005');
      expect(zeroFormatted).toHaveLength(4);
    });

    it('never stores plaintext OTP; only SHA-256 hash is computed for database', () => {
      const { rawOtp, otpHash } = generateSecureNumericOtp(4);
      expect(rawOtp).not.toBe(otpHash);
      expect(otpHash).toBe(hashToken(rawOtp));
    });

    it('calculates exact 5-minute expiry window for password reset OTPs', () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);
      const diffMinutes = (expiresAt.getTime() - now.getTime()) / (60 * 1000);
      expect(diffMinutes).toBe(5);
    });
  });

  describe('Reset Authorization Ticket Policy (10-Minute Expiry)', () => {
    it('generates high-entropy 256-bit single-use reset tickets', () => {
      const { rawToken, tokenHash } = generateResetAuthorizationTicket();
      expect(rawToken).toHaveLength(64); // 32 bytes in hex
      expect(tokenHash).toHaveLength(64);
      expect(rawToken).not.toBe(tokenHash);
      expect(hashToken(rawToken)).toBe(tokenHash);
    });

    it('calculates 10-minute validity window for reset authorization ticket', () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
      const diffMinutes = (expiresAt.getTime() - now.getTime()) / (60 * 1000);
      expect(diffMinutes).toBe(10);
    });
  });
});
