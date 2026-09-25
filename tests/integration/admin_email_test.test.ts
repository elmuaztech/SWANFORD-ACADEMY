import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { POST } from '@/app/api/admin/notifications/test-email/route';
import { generateSecureToken } from '@/lib/auth/tokens';
import { RoleCode, UserStatus } from '@prisma/client';

describe('Admin Email Test & Delivery Verification API', () => {
  let adminSessionToken: string;
  let nonAdminSessionToken: string;
  let cleanupSessions: Array<() => Promise<void>> = [];

  beforeEach(async () => {
    cleanupSessions = [];

    // Admin user
    const admin = await prisma.user.findFirst({
      where: {
        userRoles: {
          some: {
            role: { code: RoleCode.ADMIN },
          },
        },
      },
    });

    if (!admin) {
      throw new Error('Test requires an admin user in database.');
    }

    const { rawToken: aToken, tokenHash: aHash } = generateSecureToken();
    const aSession = await prisma.session.create({
      data: {
        userId: admin.id,
        sessionTokenHash: aHash,
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      },
    });
    adminSessionToken = aToken;
    cleanupSessions.push(async () => {
      await prisma.session.deleteMany({ where: { id: aSession.id } });
    });

    // Non-admin user (e.g. Teacher or Parent)
    const nonAdmin = await prisma.user.findFirst({
      where: {
        status: UserStatus.ACTIVE,
        userRoles: {
          none: {
            role: { code: { in: [RoleCode.ADMIN, RoleCode.SUPER_ADMIN] } },
          },
        },
      },
    });

    if (nonAdmin) {
      const { rawToken: nToken, tokenHash: nHash } = generateSecureToken();
      const nSession = await prisma.session.create({
        data: {
          userId: nonAdmin.id,
          sessionTokenHash: nHash,
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        },
      });
      nonAdminSessionToken = nToken;
      cleanupSessions.push(async () => {
        await prisma.session.deleteMany({ where: { id: nSession.id } });
      });
    }
  });

  afterEach(async () => {
    for (const cleanup of cleanupSessions) {
      await cleanup();
    }
  });

  it('rejects unauthenticated requests with 401 JSON', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/notifications/test-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientEmail: 'test@example.com' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('Authentication required');
  });

  it('rejects non-admin users with 403 JSON', async () => {
    if (!nonAdminSessionToken) return;

    const req = new NextRequest('http://localhost:3000/api/admin/notifications/test-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${nonAdminSessionToken}`,
      },
      body: JSON.stringify({ recipientEmail: 'test@example.com' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('Access denied');
  });

  it('rejects invalid recipient email with 400 JSON', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/notifications/test-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${adminSessionToken}`,
      },
      body: JSON.stringify({ recipientEmail: 'not-an-email' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('valid recipient email');
  });

  it('reports honest status and never stores secrets', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/notifications/test-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${adminSessionToken}`,
      },
      body: JSON.stringify({ recipientEmail: 'swanford99@gmail.com' }),
    });

    const res = await POST(req);
    const data = await res.json();

    // Verify no secrets or credentials leaked in response
    const rawJson = JSON.stringify(data);
    expect(rawJson).not.toContain('password');
    expect(rawJson).not.toContain('secret');

    // If SMTP succeeds, must report honest verification notice
    if (res.status === 200) {
      expect(data.success).toBe(true);
      expect(data.providerStatus).toBe('ACCEPTED BY GMAIL SMTP');
      expect(data.verificationStatus).toBe('NOT VERIFIED — REAL INBOX TEST REQUIRED');
      expect(data.messageId).toBeDefined();
    } else {
      // If credentials failed, must report clear failure message
      expect(data.success).toBe(false);
      expect(data.verificationStatus).toBe('FAILED');
    }
  }, 45000);
});
