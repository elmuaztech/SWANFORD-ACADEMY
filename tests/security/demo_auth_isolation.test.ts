import { describe, it, expect } from 'vitest';
import { getCurrentUser, loginUser } from '@/lib/auth/service';
import { getAuthUser } from '@/lib/auth/request_auth';
import { NextRequest } from 'next/server';

describe('Security Audit — Demo Authentication & Token Isolation', () => {
  it('rejects arbitrary, fixed, or mock session tokens in getCurrentUser', async () => {
    const mockTokens = [
      'demo_session_token_123',
      'fixed_superadmin_token_000',
      'mock_token_parent_456',
      'null',
      'undefined',
      'Bearer dummy_token',
      '00000000-0000-0000-0000-000000000000',
    ];

    for (const token of mockTokens) {
      const user = await getCurrentUser(token);
      expect(user, `Mock/fixed token "${token}" must never return a valid user`).toBeNull();
    }
  });

  it('rejects fake/unseeded demo accounts and incorrect passwords in loginUser', async () => {
    // Non-existent demo account
    await expect(
      loginUser({
        email: 'fake.demo.user@swanfordacademy.edu.ng',
        password: 'AnyPassword123!',
      })
    ).rejects.toThrow('Invalid email or password');

    // Genuine active user with incorrect password
    const { prisma } = await import('@/lib/prisma');
    await prisma.user.updateMany({
      where: { email: 'swanford99@gmail.com' },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    await expect(
      loginUser({
        email: 'swanford99@gmail.com',
        password: 'WrongPasswordAttempt999!',
      })
    ).rejects.toThrow('Invalid email or password');

    // Reset failedLoginAttempts after test so administrator remains clean for other tests
    await prisma.user.updateMany({
      where: { email: 'swanford99@gmail.com' },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  });

  it('prohibits getAuthUser from authenticating requests with forged headers or cookies', async () => {
    const reqWithFakeCookie = new NextRequest('http://localhost:3000/api/auth/me', {
      headers: {
        cookie: 'swanford_session=fixed_demo_token_xyz_123',
      },
    });

    const userFromCookie = await getAuthUser(reqWithFakeCookie);
    expect(userFromCookie).toBeNull();

    const reqWithFakeBearer = new NextRequest('http://localhost:3000/api/auth/me', {
      headers: {
        authorization: 'Bearer mock_super_admin_bearer_token',
      },
    });

    const userFromBearer = await getAuthUser(reqWithFakeBearer);
    expect(userFromBearer).toBeNull();
  });

  it('prohibits DEMO_USERS metadata usage in production environments', async () => {
    const { assertNotProduction } = await import('@/lib/auth/demo_users');
    const originalEnv = process.env.NODE_ENV;
    const env = process.env as Record<string, string | undefined>;
    try {
      env.NODE_ENV = 'production';
      expect(() => assertNotProduction()).toThrow('DEMO_USERS is strictly prohibited in production.');
    } finally {
      env.NODE_ENV = originalEnv;
    }
  });
});
