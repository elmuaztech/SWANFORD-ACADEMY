import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { POST as impersonateRoute } from '@/app/api/super-admin/impersonate/route';
import { POST as exitRoute } from '@/app/api/super-admin/impersonate/exit/route';
import { hashPassword } from '@/lib/auth/password';
import { generateSecureToken } from '@/lib/auth/tokens';
import { SESSION_COOKIE_NAME, IMPERSONATOR_COOKIE_NAME } from '@/lib/auth/cookies';
import { RoleCode, UserStatus } from '@prisma/client';

async function createTestSession(userId: string) {
  const { rawToken, tokenHash } = generateSecureToken();
  await prisma.session.create({
    data: {
      userId,
      sessionTokenHash: tokenHash,
      ipAddress: '127.0.0.1',
      userAgent: 'Vitest',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  return rawToken;
}

describe('Security Hardening — Super Admin Impersonation Controls & Audit Trail', () => {
  let superAdminUser: any;
  let superAdminSessionToken: string;
  let secondSuperAdminUser: any;

  let regularTeacherUser: any;
  let teacherSessionToken: string;

  let validTargetUser: any;
  let inactiveTargetUser: any;

  const emailPrefix = `imp.sec.${Date.now()}`;
  const testPassword = 'SecurePassword2026!';

  beforeAll(async () => {
    const superAdminRole = await prisma.role.findUnique({ where: { code: RoleCode.SUPER_ADMIN } });
    const teacherRole = await prisma.role.findUnique({ where: { code: RoleCode.TEACHER } });
    const parentRole = await prisma.role.findUnique({ where: { code: RoleCode.PARENT } });
    const hashedPassword = await hashPassword(testPassword);

    // 1. Create primary Super Admin
    superAdminUser = await prisma.user.create({
      data: {
        email: `${emailPrefix}.super1@example.com`,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: superAdminRole!.id } },
      },
    });
    superAdminSessionToken = await createTestSession(superAdminUser.id);

    // 2. Create second Super Admin (to test privilege escalation defense)
    secondSuperAdminUser = await prisma.user.create({
      data: {
        email: `${emailPrefix}.super2@example.com`,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: superAdminRole!.id } },
      },
    });

    // 3. Create regular Teacher (non-Super Admin caller)
    regularTeacherUser = await prisma.user.create({
      data: {
        email: `${emailPrefix}.teacher@example.com`,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: teacherRole!.id } },
      },
    });
    teacherSessionToken = await createTestSession(regularTeacherUser.id);

    // 4. Create active target user (Parent)
    validTargetUser = await prisma.user.create({
      data: {
        email: `${emailPrefix}.parent.active@example.com`,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: parentRole!.id } },
      },
    });

    // 5. Create inactive target user (Suspended)
    inactiveTargetUser = await prisma.user.create({
      data: {
        email: `${emailPrefix}.parent.suspended@example.com`,
        passwordHash: hashedPassword,
        status: UserStatus.SUSPENDED,
        userRoles: { create: { roleId: parentRole!.id } },
      },
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { action: { startsWith: 'IMPERSONATION' } },
    });
    await prisma.session.deleteMany({
      where: { user: { email: { startsWith: emailPrefix } } },
    });
    await prisma.userRole.deleteMany({
      where: { user: { email: { startsWith: emailPrefix } } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await impersonateRoute(
      new NextRequest('http://localhost:3000/api/super-admin/impersonate', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: validTargetUser.id, reason: 'Investigating billing support ticket #123' }),
      })
    );
    expect(res.status).toBe(401);
  });

  it('rejects non-Super Admin callers with 403 and writes denial audit log', async () => {
    const res = await impersonateRoute(
      new NextRequest('http://localhost:3000/api/super-admin/impersonate', {
        method: 'POST',
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${teacherSessionToken}`,
        },
        body: JSON.stringify({ targetUserId: validTargetUser.id, reason: 'Investigating billing support ticket #123' }),
      })
    );
    expect(res.status).toBe(403);

    const log = await prisma.auditLog.findFirst({
      where: {
        userId: regularTeacherUser.id,
        action: 'IMPERSONATION_ATTEMPT_DENIED',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).toBeDefined();
  });

  it('rejects requests with missing or insufficient reason with 400', async () => {
    // Missing reason
    const resMissing = await impersonateRoute(
      new NextRequest('http://localhost:3000/api/super-admin/impersonate', {
        method: 'POST',
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${superAdminSessionToken}`,
        },
        body: JSON.stringify({ targetUserId: validTargetUser.id }),
      })
    );
    expect(resMissing.status).toBe(400);
    const jsonMissing = await resMissing.json();
    expect(jsonMissing.error).toMatch(/reason.*required/i);

    // Reason too short (< 5 chars)
    const resShort = await impersonateRoute(
      new NextRequest('http://localhost:3000/api/super-admin/impersonate', {
        method: 'POST',
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${superAdminSessionToken}`,
        },
        body: JSON.stringify({ targetUserId: validTargetUser.id, reason: 'test' }),
      })
    );
    expect(resShort.status).toBe(400);
  });

  it('rejects self-impersonation with 400', async () => {
    const res = await impersonateRoute(
      new NextRequest('http://localhost:3000/api/super-admin/impersonate', {
        method: 'POST',
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${superAdminSessionToken}`,
        },
        body: JSON.stringify({
          targetUserId: superAdminUser.id,
          reason: 'Attempting to self-impersonate',
        }),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/cannot impersonate your own/i);
  });

  it('rejects impersonating another Super Administrator with 403', async () => {
    const res = await impersonateRoute(
      new NextRequest('http://localhost:3000/api/super-admin/impersonate', {
        method: 'POST',
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${superAdminSessionToken}`,
        },
        body: JSON.stringify({
          targetUserId: secondSuperAdminUser.id,
          reason: 'Attempting to impersonate peer Super Admin',
        }),
      })
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/super administrator account is strictly prohibited/i);
  });

  it('rejects non-existent target user with 404 (never auto-creates demo/placeholder accounts)', async () => {
    const fakeUuid = '00000000-0000-0000-0000-000000000999';
    const res = await impersonateRoute(
      new NextRequest('http://localhost:3000/api/super-admin/impersonate', {
        method: 'POST',
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${superAdminSessionToken}`,
        },
        body: JSON.stringify({
          targetUserId: fakeUuid,
          reason: 'Testing nonexistent target account',
        }),
      })
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/not found/i);

    // Verify demo placeholder accounts were NOT created
    const demoUser = await prisma.user.findFirst({
      where: { email: { contains: 'demo' } },
    });
    expect(demoUser).toBeNull();
  });

  it('rejects inactive or suspended target users with 400', async () => {
    const res = await impersonateRoute(
      new NextRequest('http://localhost:3000/api/super-admin/impersonate', {
        method: 'POST',
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${superAdminSessionToken}`,
        },
        body: JSON.stringify({
          targetUserId: inactiveTargetUser.id,
          reason: 'Investigating suspended user inquiry',
        }),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/suspended|inactive/i);
  });

  it('successfully starts impersonation with valid reason, returns cookies, and logs audit trail', async () => {
    const auditReason = 'Official Parent Portal billing discrepancy investigation #441';
    const res = await impersonateRoute(
      new NextRequest('http://localhost:3000/api/super-admin/impersonate', {
        method: 'POST',
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${superAdminSessionToken}`,
        },
        body: JSON.stringify({
          targetUserId: validTargetUser.id,
          reason: auditReason,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.targetUser.id).toBe(validTargetUser.id);

    // Verify Set-Cookie header contains impersonator and session tokens
    const setCookieHeader = res.headers.get('set-cookie') || '';
    expect(setCookieHeader).toContain(SESSION_COOKIE_NAME);
    expect(setCookieHeader).toContain(IMPERSONATOR_COOKIE_NAME);
    expect(setCookieHeader).toContain(superAdminSessionToken);

    // Verify AuditLog record in DB
    const log = await prisma.auditLog.findFirst({
      where: {
        userId: superAdminUser.id,
        action: 'IMPERSONATION_STARTED',
        entityId: validTargetUser.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).toBeDefined();
    expect((log?.newValues as any)?.reason).toBe(auditReason);
  });

  it('successfully exits impersonation and restores original admin session', async () => {
    const res = await exitRoute(
      new NextRequest('http://localhost:3000/api/super-admin/impersonate/exit', {
        method: 'POST',
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=dummy_child_session; ${IMPERSONATOR_COOKIE_NAME}=${superAdminSessionToken}`,
        },
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // Restores original session cookie and clears impersonator cookie
    const setCookieHeader = res.headers.get('set-cookie') || '';
    expect(setCookieHeader).toContain(superAdminSessionToken);
    expect(setCookieHeader).toContain(`${IMPERSONATOR_COOKIE_NAME}=;`);
  });
});
