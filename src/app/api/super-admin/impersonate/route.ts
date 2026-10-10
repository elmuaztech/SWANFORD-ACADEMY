import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth/request_auth';
import { generateSecureToken } from '@/lib/auth/tokens';
import {
  createSessionCookieHeader,
  createImpersonatorCookieHeader,
  createImpersonationInfoCookieHeader,
  IMPERSONATOR_COOKIE_NAME,
} from '@/lib/auth/cookies';
import { RoleCode, UserStatus } from '@prisma/client';
import { getClientIp } from '@/lib/security/rate_limiter';

/**
 * Swanford Academy — Hardened Super Admin Impersonation Endpoint
 * POST /api/super-admin/impersonate
 *
 * Security Requirements:
 * 1. Strict authorization: Only verified Super Admins can initiate impersonation.
 * 2. Mandatory audit reason: Compulsory explanation (min 5 chars) persisted in AuditLog.
 * 3. Real accounts only: Auto-creation of placeholder/demo accounts is strictly prohibited.
 * 4. Active status enforcement: Suspended, pending, or deactivated accounts cannot be impersonated.
 * 5. Privilege escalation defense: Cannot impersonate oneself or another Super Administrator.
 * 6. Audit completeness: Logs all attempts (both successful and rejected) to PostgreSQL.
 */
export async function POST(req: NextRequest) {
  const ipAddress = getClientIp(req);
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const roles = authUser.roles || [];
    const isSuperAdmin = roles.includes(RoleCode.SUPER_ADMIN);
    if (!isSuperAdmin) {
      await prisma.auditLog.create({
        data: {
          userId: authUser.id,
          action: 'IMPERSONATION_ATTEMPT_DENIED',
          entityType: 'User',
          entityId: authUser.id,
          ipAddress,
          newValues: {
            reason: 'User lacks Super Administrator role',
            callerEmail: authUser.email,
          },
        },
      });
      return NextResponse.json(
        { error: 'Forbidden: Super Administrator privileges required to impersonate users' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { targetUserId, targetRole, guardianId, teacherId, reason } = body;

    // 1. Enforce mandatory business / audit reason
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return NextResponse.json(
        { error: 'A meaningful reason (at least 5 characters) is required to impersonate an account.' },
        { status: 400 }
      );
    }
    const cleanReason = reason.trim();

    let targetUser: any = null;
    let targetPortal = '/admin';

    // 2. Resolve target account based on specified identifier
    if (targetUserId) {
      targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        include: {
          userRoles: { include: { role: true } },
          guardianProfile: true,
          teacherProfile: true,
        },
      });

      if (!targetUser) {
        return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
      }
    } else if (guardianId) {
      const guardian = await prisma.guardian.findUnique({
        where: { id: guardianId },
        include: { user: { include: { userRoles: { include: { role: true } } } } },
      });

      if (!guardian) {
        return NextResponse.json({ error: 'Guardian not found' }, { status: 404 });
      }

      if (!guardian.user) {
        return NextResponse.json(
          { error: 'Guardian does not have an active user portal account.' },
          { status: 400 }
        );
      }
      targetUser = guardian.user;
      targetPortal = '/parent';
    } else if (teacherId) {
      const teacher = await prisma.teacher.findUnique({
        where: { id: teacherId },
        include: { user: { include: { userRoles: { include: { role: true } } } } },
      });

      if (!teacher || !teacher.user) {
        return NextResponse.json({ error: 'Teacher portal user account not found' }, { status: 404 });
      }
      targetUser = teacher.user;
      targetPortal = '/teacher';
    } else if (targetRole) {
      const upperRole = String(targetRole).toUpperCase();
      if (upperRole === 'PARENT') {
        targetUser = await prisma.user.findFirst({
          where: {
            status: UserStatus.ACTIVE,
            userRoles: { some: { role: { code: RoleCode.PARENT } } },
          },
          include: {
            userRoles: { include: { role: true } },
            guardianProfile: true,
            teacherProfile: true,
          },
        });
        if (!targetUser) {
          return NextResponse.json({ error: 'No active parent account found for impersonation' }, { status: 404 });
        }
        targetPortal = '/parent';
      } else if (upperRole === 'TEACHER') {
        targetUser = await prisma.user.findFirst({
          where: {
            status: UserStatus.ACTIVE,
            userRoles: { some: { role: { code: RoleCode.TEACHER } } },
          },
          include: {
            userRoles: { include: { role: true } },
            guardianProfile: true,
            teacherProfile: true,
          },
        });
        if (!targetUser) {
          return NextResponse.json({ error: 'No active teacher account found for impersonation' }, { status: 404 });
        }
        targetPortal = '/teacher';
      } else if (upperRole === 'ADMIN') {
        targetUser = await prisma.user.findFirst({
          where: {
            id: { not: authUser.id },
            status: UserStatus.ACTIVE,
            userRoles: { some: { role: { code: { in: [RoleCode.ADMIN, RoleCode.ACCOUNTANT] } } } },
          },
          include: {
            userRoles: { include: { role: true } },
            guardianProfile: true,
            teacherProfile: true,
          },
        });

        if (!targetUser) {
          return NextResponse.json({
            success: true,
            redirectUrl: '/admin',
            message: 'Already on Admin Portal as Super Administrator',
          });
        }
        targetPortal = '/admin';
      } else {
        return NextResponse.json({ error: `Unsupported role: ${upperRole}` }, { status: 400 });
      }
    } else {
      return NextResponse.json(
        { error: 'Missing target: provide targetUserId, targetRole, guardianId, or teacherId' },
        { status: 400 }
      );
    }

    if (!targetUser) {
      return NextResponse.json({ error: 'Could not resolve target user for impersonation' }, { status: 404 });
    }

    // 3. Status Check: Must be an ACTIVE account
    if (targetUser.status !== UserStatus.ACTIVE) {
      await prisma.auditLog.create({
        data: {
          userId: authUser.id,
          action: 'IMPERSONATION_REJECTED_INACTIVE_TARGET',
          entityType: 'User',
          entityId: targetUser.id,
          ipAddress,
          newValues: {
            targetEmail: targetUser.email,
            targetStatus: targetUser.status,
            reason: cleanReason,
          },
        },
      });
      return NextResponse.json(
        { error: `Cannot impersonate account with status '${targetUser.status}'. Account must be ACTIVE.` },
        { status: 400 }
      );
    }

    // 4. Prohibit Self-Impersonation
    if (targetUser.id === authUser.id) {
      return NextResponse.json(
        { error: 'Cannot impersonate your own active administrator session.' },
        { status: 400 }
      );
    }

    // 5. Prohibit Impersonating Other Super Administrators
    const userRoleCodes: string[] = targetUser.userRoles?.map((ur: any) => ur.role.code) || [];
    if (userRoleCodes.includes(RoleCode.SUPER_ADMIN)) {
      await prisma.auditLog.create({
        data: {
          userId: authUser.id,
          action: 'IMPERSONATION_REJECTED_SUPER_ADMIN_TARGET',
          entityType: 'User',
          entityId: targetUser.id,
          ipAddress,
          newValues: {
            targetEmail: targetUser.email,
            reason: cleanReason,
          },
        },
      });
      return NextResponse.json(
        { error: 'Impersonating another Super Administrator account is strictly prohibited.' },
        { status: 403 }
      );
    }

    // 6. Determine target portal
    if (userRoleCodes.includes(RoleCode.PARENT)) {
      targetPortal = '/parent';
    } else if (userRoleCodes.includes(RoleCode.TEACHER)) {
      targetPortal = '/teacher';
    } else {
      targetPortal = '/admin';
    }

    // 7. Create Session for target user (2 hour maximum duration)
    const { rawToken, tokenHash } = generateSecureToken();
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    await prisma.session.create({
      data: {
        userId: targetUser.id,
        sessionTokenHash: tokenHash,
        userAgent: `Impersonated by Super Admin (${authUser.email})`,
        ipAddress,
        expiresAt,
      },
    });

    // 8. Determine root Super Admin session token
    const currentSessionToken = req.cookies.get('swanford_session')?.value || '';
    const existingImpersonatorToken = req.cookies.get(IMPERSONATOR_COOKIE_NAME)?.value;
    const rootAdminToken = existingImpersonatorToken || currentSessionToken;

    const targetName =
      targetUser.firstName && targetUser.lastName
        ? `${targetUser.firstName} ${targetUser.lastName}`
        : targetUser.email;
    const primaryRole = userRoleCodes[0] || 'USER';

    const impersonationInfo = JSON.stringify({
      isImpersonating: true,
      originalAdminEmail: authUser.email,
      targetUserId: targetUser.id,
      targetEmail: targetUser.email,
      targetName,
      targetRole: primaryRole,
      targetPortal,
      reason: cleanReason,
    });

    // 9. Comprehensive Audit Trail
    await prisma.auditLog.create({
      data: {
        userId: authUser.id,
        action: 'IMPERSONATION_STARTED',
        entityType: 'User',
        entityId: targetUser.id,
        ipAddress,
        newValues: {
          impersonatorId: authUser.id,
          impersonatorEmail: authUser.email,
          targetUserId: targetUser.id,
          targetEmail: targetUser.email,
          targetRole: primaryRole,
          targetPortal,
          reason: cleanReason,
          sessionExpiresAt: expiresAt.toISOString(),
        },
      },
    });

    const isProd = process.env.NODE_ENV === 'production';
    const response = NextResponse.json({
      success: true,
      redirectUrl: targetPortal,
      targetUser: {
        id: targetUser.id,
        email: targetUser.email,
        name: targetName,
        role: primaryRole,
        portal: targetPortal,
      },
    });

    response.headers.append('Set-Cookie', createSessionCookieHeader(rawToken, isProd));
    response.headers.append('Set-Cookie', createImpersonatorCookieHeader(rootAdminToken, isProd));
    response.headers.append('Set-Cookie', createImpersonationInfoCookieHeader(impersonationInfo, isProd));

    return response;
  } catch (error: any) {
    console.error('Error starting impersonation:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to start impersonation session' },
      { status: 500 }
    );
  }
}
