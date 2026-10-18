import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth/request_auth';
import { generateSecureToken } from '@/lib/auth/tokens';
import { RoleCode, UserStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const impersonationCookie = req.cookies.get('swanford_impersonation')?.value;
    const returnToken = req.cookies.get('swanford_admin_return_token')?.value;

    if (!impersonationCookie || !returnToken) {
      return NextResponse.json({ active: false });
    }

    try {
      const data = JSON.parse(decodeURIComponent(impersonationCookie));
      return NextResponse.json({ active: true, ...data });
    } catch {
      return NextResponse.json({ active: false });
    }
  } catch {
    return NextResponse.json({ active: false });
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthUser(req);
    if (!caller) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const callerRoles = caller.roles || [];
    const isAuthorized =
      callerRoles.includes(RoleCode.SUPER_ADMIN) || callerRoles.includes(RoleCode.ADMIN);

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Permission denied. Administrator or Super Administrator access required.' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { userId } = body;

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'Target user ID is required.' }, { status: 400 });
    }

    if (userId === caller.id) {
      return NextResponse.json(
        { error: 'Cannot impersonate your own active administrator account.' },
        { status: 400 }
      );
    }

    const adminSessionToken = req.cookies.get('swanford_session')?.value;
    if (!adminSessionToken) {
      return NextResponse.json({ error: 'Active administrator session missing.' }, { status: 400 });
    }

    // Fetch target user with linked profiles and roles
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: { include: { role: true } },
        teacherProfile: true,
        guardianProfile: true,
      },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'Target user account not found.' }, { status: 404 });
    }

    if (targetUser.status === UserStatus.DEACTIVATED) {
      return NextResponse.json(
        { error: 'Cannot impersonate a deactivated user account.' },
        { status: 400 }
      );
    }

    // Determine target user's primary name and roles
    const targetRoles = targetUser.userRoles.map((ur) => ur.role.code);
    if (targetUser.teacherProfile) targetRoles.push(RoleCode.TEACHER);
    if (targetUser.guardianProfile) targetRoles.push(RoleCode.PARENT);

    const targetName =
      targetUser.teacherProfile
        ? `${targetUser.teacherProfile.firstName} ${targetUser.teacherProfile.lastName}`
        : targetUser.guardianProfile
        ? `${targetUser.guardianProfile.firstName} ${targetUser.guardianProfile.lastName}`
        : targetUser.firstName && targetUser.lastName
        ? `${targetUser.firstName} ${targetUser.lastName}`
        : targetUser.email.split('@')[0];

    const primaryRole =
      targetRoles.includes(RoleCode.SUPER_ADMIN)
        ? 'Super Admin'
        : targetRoles.includes(RoleCode.ADMIN)
        ? 'Admin'
        : targetRoles.includes(RoleCode.ACCOUNTANT)
        ? 'Accountant'
        : targetRoles.includes(RoleCode.TEACHER)
        ? 'Teacher'
        : targetRoles.includes(RoleCode.PARENT)
        ? 'Parent'
        : 'User';

    // Determine redirection destination
    let redirectUrl = '/admin';
    if (targetRoles.includes(RoleCode.TEACHER)) {
      redirectUrl = '/teacher';
    } else if (targetRoles.includes(RoleCode.PARENT)) {
      redirectUrl = '/parent';
    } else if (targetRoles.includes(RoleCode.ACCOUNTANT)) {
      redirectUrl = '/admin/finance';
    } else if (targetRoles.includes(RoleCode.SUPER_ADMIN) || targetRoles.includes(RoleCode.ADMIN)) {
      redirectUrl = '/admin';
    }

    // Generate secure session token for impersonated target user
    const { rawToken, tokenHash } = generateSecureToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours expiry for impersonation

    await prisma.session.create({
      data: {
        userId: targetUser.id,
        sessionTokenHash: tokenHash,
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
        userAgent: req.headers.get('user-agent') || undefined,
        expiresAt,
      },
    });

    // Record audit log
    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'IMPERSONATION_START',
        entityType: 'User',
        entityId: targetUser.id,
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
        userAgent: req.headers.get('user-agent') || undefined,
        newValues: {
          adminId: caller.id,
          adminEmail: caller.email,
          targetUserId: targetUser.id,
          targetEmail: targetUser.email,
          targetRole: primaryRole,
          destination: redirectUrl,
        },
      },
    });

    const isProd = process.env.NODE_ENV === 'production';
    const response = NextResponse.json({
      success: true,
      redirectUrl,
      targetUser: {
        id: targetUser.id,
        name: targetName,
        email: targetUser.email,
        role: primaryRole,
      },
    });

    // 1. Preserve original admin token so admin can return seamlessly
    response.cookies.set('swanford_admin_return_token', adminSessionToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60,
    });

    // 2. Set active session to target user's session
    response.cookies.set('swanford_session', rawToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60,
    });

    // 3. Set client-readable metadata cookie for instant banner rendering
    const impersonationPayload = JSON.stringify({
      active: true,
      targetUserId: targetUser.id,
      targetName,
      targetEmail: targetUser.email,
      targetRole: primaryRole,
      adminId: caller.id,
      adminEmail: caller.email,
      startedAt: new Date().toISOString(),
    });

    response.cookies.set('swanford_impersonation', encodeURIComponent(impersonationPayload), {
      httpOnly: false,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60,
    });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Impersonation request failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
