import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashToken } from '@/lib/auth/tokens';
import {
  createSessionCookieHeader,
  clearImpersonatorCookieHeader,
  clearImpersonationInfoCookieHeader,
  IMPERSONATOR_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from '@/lib/auth/cookies';
import { RoleCode, UserStatus } from '@prisma/client';

export async function POST(req: NextRequest) {
  try {
    const impersonatorToken = req.cookies.get(IMPERSONATOR_COOKIE_NAME)?.value;
    const currentSessionToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;

    const isProd = process.env.NODE_ENV === 'production';

    if (!impersonatorToken) {
      // Not currently impersonating
      const res = NextResponse.json({
        success: true,
        redirectUrl: '/admin/users',
        message: 'No active impersonation session found',
      });
      res.headers.append('Set-Cookie', clearImpersonatorCookieHeader(isProd));
      res.headers.append('Set-Cookie', clearImpersonationInfoCookieHeader(isProd));
      return res;
    }

    // Verify root Super Admin session
    const rootTokenHash = hashToken(impersonatorToken);
    const now = new Date();

    const rootSession = await prisma.session.findUnique({
      where: { sessionTokenHash: rootTokenHash },
      include: {
        user: {
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        },
      },
    });

    if (
      !rootSession ||
      rootSession.expiresAt <= now ||
      rootSession.revokedAt !== null ||
      rootSession.user.status !== UserStatus.ACTIVE
    ) {
      const res = NextResponse.json(
        { error: 'Super Administrator session has expired. Please sign in again.' },
        { status: 401 }
      );
      res.headers.append('Set-Cookie', clearImpersonatorCookieHeader(isProd));
      res.headers.append('Set-Cookie', clearImpersonationInfoCookieHeader(isProd));
      return res;
    }

    const roles = rootSession.user.userRoles?.map((ur) => ur.role.code) || [];
    if (!roles.includes(RoleCode.SUPER_ADMIN)) {
      return NextResponse.json(
        { error: 'Original session lacks Super Administrator privileges.' },
        { status: 403 }
      );
    }

    // Revoke current temporary impersonation session if active
    if (currentSessionToken) {
      const currentTokenHash = hashToken(currentSessionToken);
      const currentSession = await prisma.session.findUnique({
        where: { sessionTokenHash: currentTokenHash },
      });

      if (currentSession && !currentSession.revokedAt) {
        await prisma.session.update({
          where: { id: currentSession.id },
          data: { revokedAt: new Date() },
        });

        const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
        await prisma.auditLog.create({
          data: {
            userId: rootSession.userId,
            action: 'IMPERSONATION_ENDED',
            entityType: 'User',
            entityId: currentSession.userId,
            ipAddress,
            newValues: {
              revertedToAdminEmail: rootSession.user.email,
            },
          },
        });
      }
    }

    const response = NextResponse.json({
      success: true,
      redirectUrl: '/admin/users',
      message: 'Successfully exited impersonation and restored Super Administrator session.',
    });

    // 1. Restore swanford_session -> root Super Admin token
    response.headers.append('Set-Cookie', createSessionCookieHeader(impersonatorToken, isProd));
    // 2. Clear swanford_impersonator cookie
    response.headers.append('Set-Cookie', clearImpersonatorCookieHeader(isProd));
    // 3. Clear swanford_impersonation UI cookie
    response.headers.append('Set-Cookie', clearImpersonationInfoCookieHeader(isProd));

    return response;
  } catch (error: any) {
    console.error('Error exiting impersonation:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to exit impersonation' },
      { status: 500 }
    );
  }
}
