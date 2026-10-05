import { NextRequest, NextResponse } from 'next/server';
import { loginUser } from '@/lib/auth/service';
import { RoleCode } from '@prisma/client';
import { checkRateLimit, getClientIp } from '@/lib/security/rate_limiter';

export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const rateLimit = checkRateLimit(`login_ip:${clientIp}`, {
      windowMs: 60 * 1000,
      maxRequests: 20,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { email, password, portal } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const selectedPortal = portal ? portal.toLowerCase().trim() : undefined;
    if (selectedPortal && !['admin', 'teacher', 'parent'].includes(selectedPortal)) {
      return NextResponse.json(
        { error: 'Invalid portal destination. Must be Admin, Teacher, or Parent.' },
        { status: 400 }
      );
    }

    const ipAddress = clientIp;
    const userAgent = req.headers.get('user-agent') || undefined;

    const { user, sessionToken } = await loginUser({
      email,
      password,
      portal: selectedPortal,
      ipAddress,
      userAgent,
    });

    const userRoles = user.roles || [];
    let redirectUrl = '/admin';

    if (user.mustChangePassword) {
      redirectUrl = '/auth/change-password';
    } else if (selectedPortal === 'teacher') {
      redirectUrl = '/teacher';
    } else if (selectedPortal === 'parent') {
      redirectUrl = '/parent';
    } else if (selectedPortal === 'admin') {
      if (
        userRoles.includes(RoleCode.ACCOUNTANT) &&
        !userRoles.includes(RoleCode.SUPER_ADMIN) &&
        !userRoles.includes(RoleCode.ADMIN)
      ) {
        redirectUrl = '/admin/finance';
      } else {
        redirectUrl = '/admin';
      }
    } else {
      // Unified single login: automatically determine destination based on user's authorized roles
      if (userRoles.includes(RoleCode.SUPER_ADMIN) || userRoles.includes(RoleCode.ADMIN)) {
        redirectUrl = '/admin';
      } else if (userRoles.includes(RoleCode.ACCOUNTANT)) {
        redirectUrl = '/admin/finance';
      } else if (userRoles.includes(RoleCode.TEACHER)) {
        redirectUrl = '/teacher';
      } else if (userRoles.includes(RoleCode.PARENT)) {
        redirectUrl = '/parent';
      } else {
        redirectUrl = '/admin';
      }
    }

    const response = NextResponse.json({
      success: true,
      user,
      mustChangePassword: Boolean(user.mustChangePassword),
      redirectUrl,
    });

    response.cookies.set('swanford_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid email or password.';
    const isForbidden =
      message.toLowerCase().includes('not authorized') ||
      message.toLowerCase().includes('cannot access') ||
      message.toLowerCase().includes('cannot log into') ||
      message.toLowerCase().includes('suspended') ||
      message.toLowerCase().includes('deactivated');
    return NextResponse.json({ error: message }, { status: isForbidden ? 403 : 401 });
  }
}
