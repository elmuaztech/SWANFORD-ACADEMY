import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * Swanford Academy — Password Security Utilities
 *
 * Requirements:
 * - bcryptjs implementation with work factor = 12 rounds
 * - Min 6 chars, max 72 chars (bcrypt constraint)
 * - Sentinel generator for unactivated accounts (never matches any password, 0ms compute)
 * - Zero plaintext password retention
 */

const BCRYPT_SALT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 72;

export interface PasswordValidationResult {
  valid: boolean;
  message?: string;
}

/**
 * Validates password meets Swanford Academy security policy
 */
export function validatePasswordStrength(password: string): PasswordValidationResult {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required' };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
    };
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      valid: false,
      message: `Password must not exceed ${MAX_PASSWORD_LENGTH} characters`,
    };
  }

  return { valid: true };
}

/**
 * Hashes a plaintext password using bcrypt with 12 rounds
 */
export async function hashPassword(password: string): Promise<string> {
  const validation = validatePasswordStrength(password);
  if (!validation.valid) {
    throw new Error(validation.message || 'Invalid password');
  }

  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Verifies a plaintext password against a stored bcrypt hash.
 * Safely returns false if the hash is an unactivated sentinel string.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) {
    return false;
  }

  // Fast-path: sentinel hashes for unactivated accounts never match
  if (isUnactivatedAccount(hash)) {
    return false;
  }

  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/**
 * Generates an unmatchable sentinel string for unactivated accounts.
 * This ensures bulk parent creation requires 0ms CPU hashing while
 * mathematically preventing login until the parent completes activation.
 */
export function createUnactivatedPasswordSentinel(): string {
  return `!UNACTIVATED_ACCOUNT_${crypto.randomUUID()}`;
}

/**
 * Checks if a stored password hash represents an unactivated account sentinel
 */
export function isUnactivatedAccount(hash: string): boolean {
  return typeof hash === 'string' && hash.startsWith('!UNACTIVATED_ACCOUNT_');
}
