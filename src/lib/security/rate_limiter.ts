/**
 * Swanford Academy — Sliding Window In-Memory Rate Limiter
 * Master Specification Reference: Work Package D (Public Website & Security Invariants)
 *
 * Prevents automated scraping, enumeration attacks, and abuse on public endpoints.
 */

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitRecord>();

// Cleanup stale keys every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (record.resetAt <= now) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref?.();
}

export interface RateLimitOptions {
  windowMs: number; // e.g. 60_000 for 1 minute
  maxRequests: number; // e.g. 10 requests per minute
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Checks and updates rate limit for a given key (e.g. IP + endpoint namespace).
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions = { windowMs: 60_000, maxRequests: 20 }
): RateLimitResult {
  const now = Date.now();
  const record = store.get(key);

  if (!record || record.resetAt <= now) {
    // New or expired window
    const newRecord: RateLimitRecord = {
      count: 1,
      resetAt: now + options.windowMs,
    };
    store.set(key, newRecord);
    return {
      allowed: true,
      remaining: options.maxRequests - 1,
      resetAt: newRecord.resetAt,
    };
  }

  // Window still active
  if (record.count >= options.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: record.resetAt,
    };
  }

  record.count += 1;
  return {
    allowed: true,
    remaining: options.maxRequests - record.count,
    resetAt: record.resetAt,
  };
}

const IPV4_REGEX = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_REGEX = /^(?:[a-fA-F0-9]{1,4}:){7}[a-fA-F0-9]{1,4}$|^::1$|^[a-fA-F0-9:]+$/;

function isValidIp(ip: string): boolean {
  const clean = ip.trim();
  return IPV4_REGEX.test(clean) || IPV6_REGEX.test(clean);
}

/**
 * Extracts client IP with proxy-trust hierarchy.
 * In production behind Nginx reverse proxy, X-Real-IP is set directly from the TCP $remote_addr
 * and cannot be spoofed by incoming client headers.
 */
export function getClientIp(req: Request): string {
  // 1. Authoritative proxy socket IP (set by Nginx)
  const xRealIp = req.headers.get('x-real-ip');
  if (xRealIp && isValidIp(xRealIp)) {
    return xRealIp.trim();
  }

  // 2. CF-Connecting-IP (if behind Cloudflare)
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  if (cfConnectingIp && isValidIp(cfConnectingIp)) {
    return cfConnectingIp.trim();
  }

  // 3. Fallback: Parse X-Forwarded-For taking the last valid proxy entry rather than spoofable first
  const xForwardedFor = req.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const ips = xForwardedFor.split(',').map((s) => s.trim()).filter(Boolean);
    // Scan backwards from closest proxy
    for (let i = ips.length - 1; i >= 0; i--) {
      if (isValidIp(ips[i])) {
        return ips[i];
      }
    }
  }

  return '127.0.0.1';
}

/**
 * Clears rate limit state for a specific key (e.g. on new OTP generation).
 */
export function clearRateLimit(key: string): void {
  store.delete(key);
}

