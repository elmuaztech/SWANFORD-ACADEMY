import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { POST as loginRoute } from '@/app/api/auth/login/route';
import { POST as logoutRoute } from '@/app/api/auth/logout/route';
import { getCurrentUser } from '@/lib/auth/service';
import { toUserFacingError } from '@/lib/ui/error_messages';
import { validateEnv } from '@/lib/env';
import { hashPassword } from '@/lib/auth/password';
import { RoleCode, UserStatus } from '@prisma/client';

describe('Security Audit — Web Security Controls, Cookie Policy & Session Revocation', () => {
  const testEmail = `websec.${Date.now()}@example.com`;
  const testPassword = 'WebSecPassword2026!';
  let testUserId: string;

  beforeAll(async () => {
    const parentRole = await prisma.role.findUnique({ where: { code: RoleCode.PARENT } });
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash: await hashPassword(testPassword),
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: parentRole!.id } },
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
  });

  describe('Session Cookie Attributes', () => {
    it('enforces httpOnly, sameSite lax, path, and maxAge cookie attributes on login', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      });

      const res = await loginRoute(req);
      expect(res.status).toBe(200);

      const cookie = res.cookies.get('swanford_session');
      expect(cookie).toBeDefined();
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.sameSite).toBe('lax');
      expect(cookie?.path).toBe('/');
      expect(cookie?.maxAge).toBe(7 * 24 * 60 * 60); // 7 days
    });
  });

  describe('Server-Side Logout Session Revocation', () => {
    it('revokes session in PostgreSQL immediately upon logout, preventing token reuse', async () => {
      // 1. Log in to get genuine session
      const loginReq = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      });
      const loginRes = await loginRoute(loginReq);
      const sessionToken = loginRes.cookies.get('swanford_session')!.value;

      // Verify session is active in database
      const activeUser = await getCurrentUser(sessionToken);
      expect(activeUser).not.toBeNull();
      expect(activeUser?.email).toBe(testEmail);

      // 2. Call logout endpoint with session cookie
      const logoutReq = new NextRequest('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: {
          cookie: `swanford_session=${sessionToken}`,
        },
      });
      const logoutRes = await logoutRoute(logoutReq);
      expect(logoutRes.status).toBe(200);

      // 3. Confirm cookie deletion
      const deletedCookie = logoutRes.cookies.get('swanford_session');
      expect(deletedCookie?.value).toBe('');

      // 4. CRITICAL: Confirm session in PostgreSQL is revoked and CANNOT be reused
      const revokedUser = await getCurrentUser(sessionToken);
      expect(revokedUser).toBeNull();
    });
  });

  describe('Sensitive Error Masking', () => {
    it('masks raw database and Prisma constraint errors from user-facing responses', () => {
      const rawPrismaUniqueError = {
        code: 'P2002',
        meta: { target: ['email'] },
        message: 'Unique constraint failed on the fields: (`email`)',
      };

      const userError = toUserFacingError(rawPrismaUniqueError);
      expect(userError.message).not.toContain('P2002');
      expect(userError.message).not.toContain('Unique constraint failed');
      expect(userError.message).toContain('already registered');
    });

    it('masks raw SQL connection errors from user-facing responses', () => {
      const rawDbError = new Error('connect ECONNREFUSED 127.0.0.1:5432 at postgres.query');
      const userError = toUserFacingError(rawDbError);
      expect(userError.message).not.toContain('127.0.0.1:5432');
      expect(userError.message).not.toContain('ECONNREFUSED');
      expect(userError.message).toContain('unable to connect to the academy server');
    });
  });

  describe('SMTP Configuration Validation', () => {
    it('requires SMTP_HOST when NOTIFICATION_PROVIDER is set to smtp', () => {
      expect(() => {
        validateEnv({
          NODE_ENV: 'test',
          APP_URL: 'http://localhost:3000',
          DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test?schema=public',
          SESSION_SECRET: 'a_very_long_secret_key_at_least_32_characters_long_12345',
          PAYSTACK_SECRET_KEY: 'sk_test_123',
          PAYSTACK_PUBLIC_KEY: 'pk_test_123',
          NOTIFICATION_PROVIDER: 'smtp',
          SMTP_HOST: '',
        });
      }).toThrow(/SMTP_HOST is required when NOTIFICATION_PROVIDER=smtp/);
    });

    it('validates successfully when valid SMTP configuration is provided', () => {
      const env = validateEnv({
        NODE_ENV: 'test',
        APP_URL: 'http://localhost:3000',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test?schema=public',
        SESSION_SECRET: 'a_very_long_secret_key_at_least_32_characters_long_12345',
        PAYSTACK_SECRET_KEY: 'sk_test_123',
        PAYSTACK_PUBLIC_KEY: 'pk_test_123',
        NOTIFICATION_PROVIDER: 'smtp',
        SMTP_HOST: 'smtp.mailtrap.io',
        SMTP_PORT: '587',
        SMTP_USER: 'test_user',
        SMTP_PASS: 'test_pass',
      });
      expect(env.SMTP_HOST).toBe('smtp.mailtrap.io');
      expect(env.SMTP_PORT).toBe(587);
    });
  });
});
