import { NextRequest } from 'next/server';
import { getCurrentUser, SafeUser } from '@/lib/auth/service';

/**
 * Extracts and validates the authenticated user from a Next.js API Request.
 * Supports:
 * 1. Authorization: Bearer <session_token>
 * 2. Cookie: swanford_session=<session_token>
 */
export async function getAuthUser(req: NextRequest): Promise<SafeUser | null> {
  const authHeader = req.headers.get('authorization');
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  if (!token) {
    token = req.cookies.get('swanford_session')?.value;
  }

  if (!token) return null;

  try {
    return await getCurrentUser(token);
  } catch {
    return null;
  }
}
