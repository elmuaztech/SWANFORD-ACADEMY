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

export interface GeneratedOtpPair {
  rawOtp: string;
  otpHash: string;
}

/**
 * Generates a cryptographically secure numeric OTP of exact digit length.
 * For digits=4: covers 0000-9999 and pads with leading zeros (e.g. "0427").
 * Raw OTP is for delivery only; only otpHash (SHA-256) is stored in the database.
 */
export function generateSecureNumericOtp(digits = 4): GeneratedOtpPair {
  const max = Math.pow(10, digits); // e.g. 10000 for 4 digits (range 0..9999)
  const num = crypto.randomInt(0, max);
  const rawOtp = num.toString().padStart(digits, '0');
  const otpHash = hashToken(rawOtp);
  return { rawOtp, otpHash };
}

/**
 * Generates a single-use cryptographically secure Reset Authorization Ticket.
 * Issued upon successful 4-digit OTP verification; valid for 10 minutes.
 */
export function generateResetAuthorizationTicket(): GeneratedTokenPair {
  return generateSecureToken();
}
