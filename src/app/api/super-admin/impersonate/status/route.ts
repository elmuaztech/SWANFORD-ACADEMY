import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashToken } from '@/lib/auth/tokens';
import { IMPERSONATOR_COOKIE_NAME, SESSION_COOKIE_NAME } from '@/lib/auth/cookies';
import { RoleCode, UserStatus } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const impersonatorToken = req.cookies.get(IMPERSONATOR_COOKIE_NAME)?.value;
    const currentSessionToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (!impersonatorToken || !currentSessionToken) {
      return NextResponse.json({ isImpersonating: false });
    }

    const rootTokenHash = hashToken(impersonatorToken);
    const now = new Date();

    const rootSession = await prisma.session.findUnique({
      where: { sessionTokenHash: rootTokenHash },
      include: {
        user: {
          include: {
            userRoles: { include: { role: true } },
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
      return NextResponse.json({ isImpersonating: false });
    }

    const currentTokenHash = hashToken(currentSessionToken);
    const currentSession = await prisma.session.findUnique({
      where: { sessionTokenHash: currentTokenHash },
      include: {
        user: {
          include: {
            userRoles: { include: { role: true } },
          },
        },
      },
    });

    if (!currentSession || currentSession.expiresAt <= now || currentSession.revokedAt !== null) {
      return NextResponse.json({ isImpersonating: false });
    }

    const targetUser = currentSession.user;
    const targetRoles = targetUser.userRoles.map((ur) => ur.role.code);
    const targetName =
      targetUser.firstName && targetUser.lastName
        ? `${targetUser.firstName} ${targetUser.lastName}`
        : targetUser.email;

    let targetPortal = '/admin';
    if (targetRoles.includes(RoleCode.PARENT)) targetPortal = '/parent';
    else if (targetRoles.includes(RoleCode.TEACHER)) targetPortal = '/teacher';

    return NextResponse.json({
      isImpersonating: true,
      originalAdminEmail: rootSession.user.email,
      targetUser: {
        id: targetUser.id,
        email: targetUser.email,
        name: targetName,
        role: targetRoles[0] || 'USER',
        portal: targetPortal,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ isImpersonating: false });
  }
}
