/**
 * Swanford Academy — Session Cookie Utilities
 *
 * Security Requirements:
 * - Cookie name: swanford_session
 * - HttpOnly: true (inaccessible to clientside JavaScript)
 * - SameSite: 'lax' (CSRF defense)
 * - Path: '/'
 * - Secure: true in production (adaptive for local development)
 * - MaxAge: 7 days (604,800 seconds)
 */

export const SESSION_COOKIE_NAME = 'swanford_session';
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  maxAge: number;
}

/**
 * Returns standard cookie options for the session cookie
 */
export function getSessionCookieOptions(isProduction?: boolean): CookieOptions {
  const prod = isProduction !== undefined ? isProduction : process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: prod,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/**
 * Generates the Set-Cookie header string for setting the session cookie
 */
export function createSessionCookieHeader(rawToken: string, isProduction?: boolean): string {
  const options = getSessionCookieOptions(isProduction);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}`,
    `Path=${options.path}`,
    `Max-Age=${options.maxAge}`,
    `SameSite=Lax`,
    'HttpOnly',
  ];

  if (options.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

/**
 * Generates the Set-Cookie header string for clearing the session cookie on logout
 */
export function clearSessionCookieHeader(isProduction?: boolean): string {
  const options = getSessionCookieOptions(isProduction);
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    `Path=${options.path}`,
    'Max-Age=0',
    `Expires=${new Date(0).toUTCString()}`,
    `SameSite=Lax`,
    'HttpOnly',
  ];

  if (options.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

export const IMPERSONATOR_COOKIE_NAME = 'swanford_impersonator';
export const IMPERSONATION_INFO_COOKIE_NAME = 'swanford_impersonation';
export const IMPERSONATION_MAX_AGE_SECONDS = 2 * 60 * 60; // 2 hours

/**
 * Generates Set-Cookie header for storing the Super Admin's original session token during impersonation.
 */
export function createImpersonatorCookieHeader(rawToken: string, isProduction?: boolean): string {
  const prod = isProduction !== undefined ? isProduction : process.env.NODE_ENV === 'production';
  const parts = [
    `${IMPERSONATOR_COOKIE_NAME}=${encodeURIComponent(rawToken)}`,
    'Path=/',
    `Max-Age=${IMPERSONATION_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
    'HttpOnly',
  ];
  if (prod) parts.push('Secure');
  return parts.join('; ');
}

/**
 * Generates Set-Cookie header for clearing the impersonator cookie.
 */
export function clearImpersonatorCookieHeader(isProduction?: boolean): string {
  const prod = isProduction !== undefined ? isProduction : process.env.NODE_ENV === 'production';
  const parts = [
    `${IMPERSONATOR_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    `Expires=${new Date(0).toUTCString()}`,
    'SameSite=Lax',
    'HttpOnly',
  ];
  if (prod) parts.push('Secure');
  return parts.join('; ');
}

/**
 * Generates Set-Cookie header for clientside impersonation metadata (accessible to UI banner).
 */
export function createImpersonationInfoCookieHeader(infoJson: string, isProduction?: boolean): string {
  const prod = isProduction !== undefined ? isProduction : process.env.NODE_ENV === 'production';
  const parts = [
    `${IMPERSONATION_INFO_COOKIE_NAME}=${encodeURIComponent(infoJson)}`,
    'Path=/',
    `Max-Age=${IMPERSONATION_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
  ];
  if (prod) parts.push('Secure');
  return parts.join('; ');
}

/**
 * Generates Set-Cookie header for clearing clientside impersonation metadata.
 */
export function clearImpersonationInfoCookieHeader(isProduction?: boolean): string {
  const prod = isProduction !== undefined ? isProduction : process.env.NODE_ENV === 'production';
  const parts = [
    `${IMPERSONATION_INFO_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    `Expires=${new Date(0).toUTCString()}`,
    'SameSite=Lax',
  ];
  if (prod) parts.push('Secure');
  return parts.join('; ');
}
