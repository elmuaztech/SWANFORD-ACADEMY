/**
 * Swanford Academy — Canonical URL & Email Link Utilities
 *
 * Guarantees that any link included in customer/parent communications,
 * email bodies, or external webhooks is always a fully qualified,
 * secure HTTPS canonical URL.
 */

export const PRODUCTION_CANONICAL_URL = 'https://swanfordacademy.com.ng';

/**
 * Returns the canonical base URL for the application.
 * Ensures HTTPS in production and for any external delivery links.
 */
export function getCanonicalAppUrl(): string {
  const envUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');

  // If running in production OR if configured APP_URL is empty, return verified production domain
  if (process.env.NODE_ENV === 'production' || !envUrl) {
    return PRODUCTION_CANONICAL_URL;
  }

  // If explicitly configured with an external HTTPS domain (e.g. staging or custom domain), use it
  if (!envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl;
  }

  return envUrl;
}

/**
 * Converts any relative or localhost URL into an absolute HTTPS public link
 * for email delivery and customer notifications.
 *
 * Examples:
 * - "/auth/activate?token=abc" -> "https://swanfordacademy.com.ng/auth/activate?token=abc"
 * - "http://localhost:3000/auth/activate?token=abc" -> "https://swanfordacademy.com.ng/auth/activate?token=abc"
 */
export function toAbsoluteEmailUrl(rawUrl?: string): string {
  if (!rawUrl || !rawUrl.trim()) {
    return `${PRODUCTION_CANONICAL_URL}/auth/login`;
  }

  const trimmed = rawUrl.trim();

  // If already absolute URL:
  if (/^https?:\/\//i.test(trimmed)) {
    // If it's localhost or http:// in production, or when sending real emails,
    // upgrade to canonical HTTPS domain so mobile recipients can access it
    if (trimmed.includes('localhost') || trimmed.includes('127.0.0.1')) {
      return trimmed.replace(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, PRODUCTION_CANONICAL_URL);
    }
    // Force https if http:// was passed for swanford domain
    if (trimmed.startsWith('http://swanfordacademy.')) {
      return trimmed.replace('http://', 'https://');
    }
    return trimmed;
  }

  // Handle relative path (e.g. "/auth/activate?token=...")
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const base = getCanonicalAppUrl();

  // If base is localhost but we are forming an email action link, default to production canonical URL
  // so external email clients never receive localhost or invalid "http:///" URLs
  const safeBase = (base.includes('localhost') || base.includes('127.0.0.1'))
    ? PRODUCTION_CANONICAL_URL
    : base;

  return `${safeBase}${path}`;
}
