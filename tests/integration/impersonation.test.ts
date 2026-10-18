import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { POST as impersonateRoute } from '@/app/api/admin/impersonate/route';
import { POST as exitRoute } from '@/app/api/admin/impersonate/exit/route';
import { hashPassword } from '@/lib/auth/password';
import { generateSecureToken } from '@/lib/auth/tokens';
import { RoleCode, UserStatus, User } from '@prisma/client';

describe('Admin & Super Admin Impersonation API Integration Tests', () => {
  let superAdminUser: User;
  let adminUser: User;
  let teacherUser: User;
  let superAdminToken: string;
  let teacherToken: string;

  const testPassword = 'Password2026!Secure';
  const prefix = `imp.test.${Date.now()}`;

  beforeAll(async () => {
    const superAdminRole = await prisma.role.findUnique({ where: { code: RoleCode.SUPER_ADMIN } });
    const adminRole = await prisma.role.findUnique({ where: { code: RoleCode.ADMIN } });
    const teacherRole = await prisma.role.findUnique({ where: { code: RoleCode.TEACHER } });
    const hashedPassword = await hashPassword(testPassword);

    // 1. Super Admin
    superAdminUser = await prisma.user.create({
      data: {
        email: `${prefix}.sadmin@example.com`,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: superAdminRole!.id } },
      },
    });

    const sadminTokenPair = generateSecureToken();
    superAdminToken = sadminTokenPair.rawToken;
    await prisma.session.create({
      data: {
        userId: superAdminUser.id,
        sessionTokenHash: sadminTokenPair.tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // 2. Admin
    adminUser = await prisma.user.create({
      data: {
        email: `${prefix}.admin@example.com`,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: adminRole!.id } },
      },
    });

    // 3. Teacher
    teacherUser = await prisma.user.create({
      data: {
        email: `${prefix}.teacher@example.com`,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: teacherRole!.id } },
        teacherProfile: {
          create: {
            staffIdNumber: `TCH-${Date.now()}`,
            firstName: 'Amina',
            lastName: 'Suleiman',
            status: 'ACTIVE',
          },
        },
      },
    });

    const teacherTokenPair = generateSecureToken();
    teacherToken = teacherTokenPair.rawToken;
    await prisma.session.create({
      data: {
        userId: teacherUser.id,
        sessionTokenHash: teacherTokenPair.tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  });

  afterAll(async () => {
    const testUserIds = [superAdminUser?.id, adminUser?.id, teacherUser?.id].filter(Boolean);
    await prisma.session.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.teacher.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
  });

  it('1. Rejects impersonation requests from unauthorized non-admin users', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/impersonate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `swanford_session=${teacherToken}`,
      },
      body: JSON.stringify({ userId: superAdminUser.id }),
    });

    const res = await impersonateRoute(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain('Administrator or Super Administrator access required');
  });

  it('2. Prevents an administrator from impersonating themselves', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/impersonate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `swanford_session=${superAdminToken}`,
      },
      body: JSON.stringify({ userId: superAdminUser.id }),
    });

    const res = await impersonateRoute(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Cannot impersonate your own active administrator account');
  });

  it('3. Successfully starts impersonating a teacher and configures return token and destination', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/impersonate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `swanford_session=${superAdminToken}`,
      },
      body: JSON.stringify({ userId: teacherUser.id }),
    });

    const res = await impersonateRoute(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.redirectUrl).toBe('/teacher');
    expect(data.targetUser.email).toBe(teacherUser.email);
    expect(data.targetUser.role).toBe('Teacher');

    // Inspect cookies
    const setCookies = res.headers.getSetCookie();
    const returnCookie = setCookies.find((c) => c.includes('swanford_admin_return_token='));
    const sessionCookie = setCookies.find((c) => c.includes('swanford_session='));
    const metadataCookie = setCookies.find((c) => c.includes('swanford_impersonation='));

    expect(returnCookie).toBeDefined();
    expect(returnCookie).toContain(superAdminToken);
    expect(sessionCookie).toBeDefined();
    expect(metadataCookie).toBeDefined();
  });

  it('4. Successfully exits impersonation and restores the original administrator session', async () => {
    // Start impersonation to get cookies
    const startReq = new NextRequest('http://localhost:3000/api/admin/impersonate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `swanford_session=${superAdminToken}`,
      },
      body: JSON.stringify({ userId: teacherUser.id }),
    });
    const startRes = await impersonateRoute(startReq);
    const setCookies = startRes.headers.getSetCookie();
    const tempSessionHeader = setCookies.find((c) => c.includes('swanford_session='))!;
    const tempSessionToken = tempSessionHeader.match(/swanford_session=([^;]+)/)![1];

    // Call exit route
    const exitReq = new NextRequest('http://localhost:3000/api/admin/impersonate/exit', {
      method: 'POST',
      headers: {
        cookie: `swanford_session=${tempSessionToken}; swanford_admin_return_token=${superAdminToken}`,
      },
    });

    const exitRes = await exitRoute(exitReq);
    expect(exitRes.status).toBe(200);

    const exitData = await exitRes.json();
    expect(exitData.success).toBe(true);
    expect(exitData.redirectUrl).toBe('/admin/users');

    const exitCookies = exitRes.headers.getSetCookie();
    const restoredSession = exitCookies.find((c) => c.includes('swanford_session='));
    expect(restoredSession).toContain(superAdminToken);

    const clearedReturnToken = exitCookies.find((c) => c.includes('swanford_admin_return_token='));
    expect(clearedReturnToken).toBeDefined();
    expect(clearedReturnToken?.toLowerCase()).toMatch(/(max-age=0|expires=thu, 01 jan 1970)/);
  });
});
