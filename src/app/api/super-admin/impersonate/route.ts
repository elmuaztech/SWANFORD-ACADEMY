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

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const roles = authUser.roles || [];
    const isSuperAdmin = roles.includes(RoleCode.SUPER_ADMIN);
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: Super Administrator privileges required to impersonate users' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { targetUserId, targetRole, guardianId, teacherId } = body;

    let targetUser: any = null;
    let targetPortal = '/admin';

    // 1. Direct user lookup by targetUserId
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
    }
    // 2. Direct lookup by guardianId
    else if (guardianId) {
      const guardian = await prisma.guardian.findUnique({
        where: { id: guardianId },
        include: { user: { include: { userRoles: { include: { role: true } } } } },
      });

      if (!guardian) {
        return NextResponse.json({ error: 'Guardian not found' }, { status: 404 });
      }

      if (guardian.user) {
        targetUser = guardian.user;
      } else {
        // Auto-provision portal user for this guardian
        const parentRole = await prisma.role.findFirst({ where: { code: RoleCode.PARENT } });
        const fallbackEmail = guardian.email?.toLowerCase().trim() || `guardian-${guardian.id.slice(0, 8)}@swanford.example.com`;
        
        targetUser = await prisma.user.create({
          data: {
            email: fallbackEmail,
            firstName: guardian.firstName,
            lastName: guardian.lastName,
            phoneNumber: guardian.phonePrimary || null,
            passwordHash: 'IMPERSONATION_ACCOUNT',
            status: UserStatus.ACTIVE,
            userRoles: parentRole ? { create: { roleId: parentRole.id } } : undefined,
          },
          include: {
            userRoles: { include: { role: true } },
            guardianProfile: true,
            teacherProfile: true,
          },
        });

        await prisma.guardian.update({
          where: { id: guardian.id },
          data: { userId: targetUser.id },
        });
      }
      targetPortal = '/parent';
    }
    // 3. Direct lookup by teacherId
    else if (teacherId) {
      const teacher = await prisma.teacher.findUnique({
        where: { id: teacherId },
        include: { user: { include: { userRoles: { include: { role: true } } } } },
      });

      if (!teacher || !teacher.user) {
        return NextResponse.json({ error: 'Teacher account not found' }, { status: 404 });
      }
      targetUser = teacher.user;
      targetPortal = '/teacher';
    }
    // 4. Direct Role portal jump ('PARENT' | 'TEACHER' | 'ADMIN')
    else if (targetRole) {
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
          // Find any guardian
          const anyGuardian = await prisma.guardian.findFirst({
            include: { user: { include: { userRoles: { include: { role: true } } } } },
          });

          if (anyGuardian?.user) {
            targetUser = anyGuardian.user;
          } else {
            // Provision demonstration parent
            const parentRole = await prisma.role.findFirst({ where: { code: RoleCode.PARENT } });
            targetUser = await prisma.user.create({
              data: {
                email: 'parent.demo@swanford.example.com',
                firstName: anyGuardian?.firstName || 'Parent',
                lastName: anyGuardian?.lastName || 'Demo',
                passwordHash: 'IMPERSONATION_ACCOUNT',
                status: UserStatus.ACTIVE,
                userRoles: parentRole ? { create: { roleId: parentRole.id } } : undefined,
              },
              include: {
                userRoles: { include: { role: true } },
                guardianProfile: true,
                teacherProfile: true,
              },
            });
            if (anyGuardian) {
              await prisma.guardian.update({ where: { id: anyGuardian.id }, data: { userId: targetUser.id } });
            }
          }
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
          // Find teacher record
          const anyTeacher = await prisma.teacher.findFirst({
            include: { user: { include: { userRoles: { include: { role: true } } } } },
          });
          if (anyTeacher?.user) {
            targetUser = anyTeacher.user;
          } else {
            // Provision demonstration teacher
            const teacherRole = await prisma.role.findFirst({ where: { code: RoleCode.TEACHER } });
            targetUser = await prisma.user.create({
              data: {
                email: 'teacher.demo@swanford.example.com',
                firstName: 'Demonstration',
                lastName: 'Teacher',
                passwordHash: 'IMPERSONATION_ACCOUNT',
                status: UserStatus.ACTIVE,
                userRoles: teacherRole ? { create: { roleId: teacherRole.id } } : undefined,
              },
              include: {
                userRoles: { include: { role: true } },
                guardianProfile: true,
                teacherProfile: true,
              },
            });
            await prisma.teacher.create({
              data: {
                userId: targetUser.id,
                staffIdNumber: `STF-${Date.now().toString().slice(-4)}`,
                firstName: 'Demonstration',
                lastName: 'Teacher',
              },
            });
          }
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
          // If no second admin exists, target is self or general admin
          targetPortal = '/admin';
          return NextResponse.json({
            success: true,
            redirectUrl: '/admin',
            message: 'Already on Admin Portal as Super Administrator',
          });
        }
        targetPortal = '/admin';
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

    // Determine target portal based on target user's roles if not already set
    const userRoleCodes: string[] = targetUser.userRoles?.map((ur: any) => ur.role.code) || [];
    if (userRoleCodes.includes(RoleCode.PARENT)) {
      targetPortal = '/parent';
    } else if (userRoleCodes.includes(RoleCode.TEACHER)) {
      targetPortal = '/teacher';
    } else {
      targetPortal = '/admin';
    }

    // Create session for target user
    const { rawToken, tokenHash } = generateSecureToken();
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hour impersonation window
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;

    await prisma.session.create({
      data: {
        userId: targetUser.id,
        sessionTokenHash: tokenHash,
        userAgent: `Impersonated by Super Admin (${authUser.email})`,
        ipAddress,
        expiresAt,
      },
    });

    // Determine root Super Admin session token
    const currentSessionToken = req.cookies.get('swanford_session')?.value || '';
    const existingImpersonatorToken = req.cookies.get(IMPERSONATOR_COOKIE_NAME)?.value;
    const rootAdminToken = existingImpersonatorToken || currentSessionToken;

    // Target user display info
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
    });

    // Record audit log
    await prisma.auditLog.create({
      data: {
        userId: authUser.id,
        action: 'IMPERSONATION_STARTED',
        entityType: 'User',
        entityId: targetUser.id,
        ipAddress,
        newValues: {
          impersonatorEmail: authUser.email,
          targetEmail: targetUser.email,
          targetRole: primaryRole,
          targetPortal,
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

    // Set cookies:
    // 1. swanford_session -> new target token
    // 2. swanford_impersonator -> root Super Admin token
    // 3. swanford_impersonation -> UI metadata
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
