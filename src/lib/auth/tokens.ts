import crypto from 'crypto';

/**
 * Swanford Academy — Cryptographic Token Utilities
 *
 * Security Requirements:
 * - 256-bit cryptographically secure randomness (crypto.randomBytes(32))
 * - Only SHA-256 hashes stored in PostgreSQL
 * - Raw tokens never stored in DB and never logged
 */

export interface GeneratedTokenPair {
  rawToken: string;
  tokenHash: string;
}

/**
 * Generates a 256-bit high-entropy token and its corresponding SHA-256 hash.
 * The rawToken is returned to be sent via cookie or activation email link.
 * The tokenHash is what must be stored in the database.
 */
export function generateSecureToken(): GeneratedTokenPair {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  return { rawToken, tokenHash };
}

/**
 * Computes the SHA-256 hash of a raw token for database lookup.
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
}

/**
 * Validates that a string is a valid 64-character SHA-256 hex string.
 */
export function isValidTokenHashFormat(hash: string): boolean {
  return typeof hash === 'string' && /^[0-9a-f]{64}$/i.test(hash);
}
