import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/security/rate_limiter';

/**
 * Swanford Academy — Secure Cron Authorization & Invariant Enforcement
 *
 * Requirements:
 * - Constant-time comparison using crypto.timingSafeEqual (no timing attacks)
 * - Fails closed in ALL environments (no development bypass)
 * - Minimum secret length requirement (16 characters)
 * - IP rate limiting on cron triggering endpoints
 */
export function verifyCronAuthorization(req: NextRequest): { authorized: boolean; response?: NextResponse } {
  const ip = getClientIp(req);
  const rateLimit = checkRateLimit(`cron_trigger:${ip}`, { windowMs: 60_000, maxRequests: 30 });
  if (!rateLimit.allowed) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Rate limit exceeded for cron invocations.' },
        { status: 429 }
      ),
    };
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.trim().length < 16) {
    console.error('[CRON_AUTH_CRITICAL]: Server missing CRON_SECRET or secret is too short (min 16 chars).');
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'CRON_SECRET is not configured or fails minimum security requirements.' },
        { status: 500 }
      ),
    };
  }

  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Unauthorized cron execution. Bearer token required.' },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.slice(7).trim();
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(cronSecret.trim());

  if (tokenBuf.length !== secretBuf.length || !crypto.timingSafeEqual(tokenBuf, secretBuf)) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Unauthorized cron execution.' },
        { status: 401 }
      ),
    };
  }

  return { authorized: true };
}
