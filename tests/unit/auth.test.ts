import { describe, it, expect } from 'vitest';
import {
  validatePasswordStrength,
  hashPassword,
  verifyPassword,
  createUnactivatedPasswordSentinel,
  isUnactivatedAccount,
} from '@/lib/auth/password';
import { generateSecureToken, hashToken, isValidTokenHashFormat } from '@/lib/auth/tokens';
import {
  getSessionCookieOptions,
  createSessionCookieHeader,
  clearSessionCookieHeader,
  SESSION_COOKIE_NAME,
} from '@/lib/auth/cookies';

describe('Auth Unit Tests — Password Security & Strength', () => {
  it('rejects passwords shorter than 6 characters', () => {
    const res = validatePasswordStrength('12345');
    expect(res.valid).toBe(false);
    expect(res.message).toContain('at least 6 characters');
  });

  it('rejects passwords longer than 72 characters (bcrypt maximum)', () => {
    const longPassword = 'A'.repeat(73);
    const res = validatePasswordStrength(longPassword);
    expect(res.valid).toBe(false);
    expect(res.message).toContain('must not exceed 72 characters');
  });

  it('accepts valid passwords between 6 and 72 characters', () => {
    const res = validatePasswordStrength('123456');
    expect(res.valid).toBe(true);
    const res2 = validatePasswordStrength('ValidPassword123!');
    expect(res2.valid).toBe(true);
  });

  it('hashes and correctly verifies passwords with bcryptjs 12 rounds', async () => {
    const password = 'SwanfordSecurePassword2026';
    const hash = await hashPassword(password);

    expect(hash).toBeDefined();
    expect(hash.startsWith('$2')).toBe(true);

    const match = await verifyPassword(password, hash);
    expect(match).toBe(true);

    const wrongMatch = await verifyPassword('WrongPassword123', hash);
    expect(wrongMatch).toBe(false);
  });

  it('generates unactivated sentinels that never match any password', async () => {
    const sentinel = createUnactivatedPasswordSentinel();

    expect(isUnactivatedAccount(sentinel)).toBe(true);
    expect(isUnactivatedAccount('standard-hash')).toBe(false);

    // Verify password against sentinel returns false immediately without throwing
    const match = await verifyPassword('SomePassword', sentinel);
    expect(match).toBe(false);
  });
});

describe('Auth Unit Tests — Cryptographic Tokens', () => {
  it('generates 256-bit cryptographically secure token pairs', () => {
    const { rawToken, tokenHash } = generateSecureToken();

    expect(rawToken).toHaveLength(64); // 32 bytes in hex = 64 characters
    expect(tokenHash).toHaveLength(64); // SHA-256 in hex = 64 characters
    expect(isValidTokenHashFormat(tokenHash)).toBe(true);

    // Ensure raw token is not equal to token hash
    expect(rawToken).not.toBe(tokenHash);

    // Hash of rawToken matches tokenHash
    expect(hashToken(rawToken)).toBe(tokenHash);
  });

  it('consistently hashes identical inputs', () => {
    const token = 'test-token-value-12345';
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);
    expect(hash1).toBe(hash2);
  });
});

describe('Auth Unit Tests — Session Cookies', () => {
  it('returns standard HttpOnly and SameSite=Lax cookie options', () => {
    const options = getSessionCookieOptions(true);
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.secure).toBe(true);
    expect(options.path).toBe('/');
    expect(options.maxAge).toBe(7 * 24 * 60 * 60);
  });

  it('formats session cookie headers properly', () => {
    const header = createSessionCookieHeader('sample_raw_token_xyz', true);
    expect(header).toContain(`${SESSION_COOKIE_NAME}=sample_raw_token_xyz`);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Secure');
    expect(header).toContain('Path=/');
  });

  it('formats clear session cookie header with Max-Age=0', () => {
    const header = clearSessionCookieHeader(true);
    expect(header).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(header).toContain('Max-Age=0');
    expect(header).toContain('HttpOnly');
  });
});
