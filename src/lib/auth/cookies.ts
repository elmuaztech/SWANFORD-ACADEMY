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
