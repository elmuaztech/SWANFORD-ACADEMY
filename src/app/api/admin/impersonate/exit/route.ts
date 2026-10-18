import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth/request_auth';
import { hashToken } from '@/lib/auth/tokens';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const returnToken = req.cookies.get('swanford_admin_return_token')?.value;
    const currentSessionToken = req.cookies.get('swanford_session')?.value;

    if (!returnToken) {
      return NextResponse.json(
        { error: 'No active administrator impersonation session found.' },
        { status: 400 }
      );
    }

    // Verify return token matches an active admin user in the database
    const adminTokenHash = hashToken(returnToken);
    const adminSession = await prisma.session.findUnique({
      where: { sessionTokenHash: adminTokenHash },
      include: {
        user: {
          include: {
            userRoles: { include: { role: true } },
          },
        },
      },
    });

    if (!adminSession || adminSession.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Original administrator session has expired. Please log in again.' },
        { status: 401 }
      );
    }

    const currentImpersonatedUser = await getAuthUser(req);

    // Delete current temporary session to keep DB clean
    if (currentSessionToken) {
      const currentTokenHash = hashToken(currentSessionToken);
      await prisma.session.deleteMany({
        where: { sessionTokenHash: currentTokenHash },
      }).catch(() => {});
    }

    // Record audit log for impersonation exit
    await prisma.auditLog.create({
      data: {
        userId: adminSession.user.id,
        action: 'IMPERSONATION_END',
        entityType: 'User',
        entityId: currentImpersonatedUser?.id || adminSession.user.id,
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
        userAgent: req.headers.get('user-agent') || undefined,
        newValues: {
          restoredAdminId: adminSession.user.id,
          restoredAdminEmail: adminSession.user.email,
          exitedUserId: currentImpersonatedUser?.id,
          exitedUserEmail: currentImpersonatedUser?.email,
        },
      },
    });

    const isProd = process.env.NODE_ENV === 'production';
    const response = NextResponse.json({
      success: true,
      redirectUrl: '/admin/users',
      message: 'Impersonation ended. Returned to administrator account.',
    });

    // 1. Restore the original administrator session
    response.cookies.set('swanford_session', returnToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    // 2. Clear return token cookie
    response.cookies.delete('swanford_admin_return_token');

    // 3. Clear client-side impersonation cookie
    response.cookies.delete('swanford_impersonation');

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to exit impersonation.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
