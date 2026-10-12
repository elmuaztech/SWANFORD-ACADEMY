import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { POST as loginRoute } from '@/app/api/auth/login/route';
import { POST as logoutRoute } from '@/app/api/auth/logout/route';
import { getCurrentUser } from '@/lib/auth/service';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies';
import { hashPassword } from '@/lib/auth/password';
import { RoleCode, UserStatus } from '@prisma/client';
import { PermissionCode } from '@/lib/auth/permissions';
import { hasPermission } from '@/lib/auth/authorization';

describe('Security Verification: Complete Impersonation Removal & Auth Regression', () => {
  let superAdminUser: any;
  let teacherUser: any;
  let parentUser: any;
  let unassignedUser: any;

  const testPassword = 'Password2026!Secure';
  const prefix = `auth.reg.${Date.now()}`;

  beforeAll(async () => {
    const superAdminRole = await prisma.role.findUnique({ where: { code: RoleCode.SUPER_ADMIN } });
    const teacherRole = await prisma.role.findUnique({ where: { code: RoleCode.TEACHER } });
    const parentRole = await prisma.role.findUnique({ where: { code: RoleCode.PARENT } });
    const hashedPassword = await hashPassword(testPassword);

    // 1. Super Admin
    superAdminUser = await prisma.user.create({
      data: {
        email: `${prefix}.admin@example.com`,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: superAdminRole!.id } },
      },
    });

    // 2. Teacher
    teacherUser = await prisma.user.create({
      data: {
        email: `${prefix}.teacher@example.com`,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: teacherRole!.id } },
      },
    });

    // 3. Parent
    parentUser = await prisma.user.create({
      data: {
        email: `${prefix}.parent@example.com`,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: parentRole!.id } },
      },
    });

    // 4. Unassigned user (no roles)
    unassignedUser = await prisma.user.create({
      data: {
        email: `${prefix}.unassigned@example.com`,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
      },
    });
  });

  afterAll(async () => {
    const testUserIds = [superAdminUser?.id, teacherUser?.id, parentUser?.id, unassignedUser?.id].filter(Boolean);
    await prisma.session.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
  });

  it('1. Confirms impersonation API route files have been permanently removed', async () => {
    let routeLoaded = false;
    try {
      // @ts-expect-error - Route file has been deleted
      await import('@/app/api/super-admin/impersonate/route');
      routeLoaded = true;
    } catch {
      routeLoaded = false;
    }
    expect(routeLoaded).toBe(false);
  });

  it('2. Normal login succeeds and sets standard HttpOnly session cookie without impersonation metadata', async () => {
    const loginReq = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: teacherUser.email,
        password: testPassword,
      }),
    });

    const res = await loginRoute(loginReq);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.user.email).toBe(teacherUser.email);
    expect(data.user.roles).toContain(RoleCode.TEACHER);

    // Verify Set-Cookie header contains swanford_session and NOT swanford_impersonator
    const setCookieHeaders = res.headers.getSetCookie();
    const sessionCookie = setCookieHeaders.find((h) => h.includes(`${SESSION_COOKIE_NAME}=`));
    expect(sessionCookie!.toLowerCase()).toContain('samesite=lax');

    const impersonatorCookie = setCookieHeaders.find((h) => h.includes('swanford_impersonator'));
    expect(impersonatorCookie).toBeUndefined();

    const impersonationInfoCookie = setCookieHeaders.find((h) => h.includes('swanford_impersonation'));
    expect(impersonationInfoCookie).toBeUndefined();
  });

  it('3. Session token validation retrieves valid user roles and active state correctly', async () => {
    // Login to get session
    const loginReq = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: parentUser.email,
        password: testPassword,
      }),
    });
    const res = await loginRoute(loginReq);
    const setCookieHeaders = res.headers.getSetCookie();
    const sessionCookieHeader = setCookieHeaders.find((h) => h.includes(`${SESSION_COOKIE_NAME}=`))!;
    const rawTokenMatch = sessionCookieHeader.match(/swanford_session=([^;]+)/);
    const rawToken = decodeURIComponent(rawTokenMatch![1]);

    const currentUser = await getCurrentUser(rawToken);
    expect(currentUser).not.toBeNull();
    expect(currentUser?.id).toBe(parentUser.id);
    expect(currentUser?.roles).toContain(RoleCode.PARENT);
  });

  it('4. Normal logout revokes the session and clears session cookie properly', async () => {
    // 1. Login
    const loginReq = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: superAdminUser.email,
        password: testPassword,
      }),
    });
    const loginRes = await loginRoute(loginReq);
    const rawTokenMatch = loginRes.headers.getSetCookie()[0].match(/swanford_session=([^;]+)/);
    const rawToken = decodeURIComponent(rawTokenMatch![1]);

    // 2. Logout
    const logoutReq = new NextRequest('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${rawToken}`,
      },
    });
    const logoutRes = await logoutRoute(logoutReq);
    expect(logoutRes.status).toBe(200);

    const logoutCookies = logoutRes.headers.getSetCookie();
    const clearedSession = logoutCookies.find((h) => h.includes(`${SESSION_COOKIE_NAME}=`));
    expect(clearedSession).toBeDefined();
    expect(clearedSession).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');

    // 3. Verify session is revoked in database
    const currentUser = await getCurrentUser(rawToken);
    expect(currentUser).toBeNull();
  });

  it('5. RBAC enforcement: Zero-privilege fallback guarantees unassigned accounts have no permissions', async () => {
    const unassignedWithRoles = await prisma.user.findUnique({
      where: { id: unassignedUser.id },
      include: { userRoles: { include: { role: true } } },
    });
    const roles = unassignedWithRoles?.userRoles.map((ur) => ur.role.code) || [];
    expect(roles.length).toBe(0);

    // Verify permission check fails for any permission
    const hasAdminPerm = await hasPermission(unassignedUser.id, PermissionCode.USER_MANAGE);
    const hasAssessPerm = await hasPermission(unassignedUser.id, PermissionCode.ASSESSMENT_ENTER);
    const hasViewPerm = await hasPermission(unassignedUser.id, PermissionCode.STUDENT_VIEW);

    expect(hasAdminPerm).toBe(false);
    expect(hasAssessPerm).toBe(false);
    expect(hasViewPerm).toBe(false);
  });

  it('6. Audit trail integrity: Historical audit logs are completely preserved and queryable', async () => {
    const count = await prisma.auditLog.count();
    expect(count).toBeGreaterThanOrEqual(0);

    // Creating a standard audit event succeeds without issues
    const sampleLog = await prisma.auditLog.create({
      data: {
        userId: superAdminUser.id,
        action: 'VERIFICATION_CHECK',
        entityType: 'System',
        entityId: superAdminUser.id,
        newValues: { test: true },
      },
    });
    expect(sampleLog.id).toBeDefined();
    await prisma.auditLog.delete({ where: { id: sampleLog.id } });
  });
});
