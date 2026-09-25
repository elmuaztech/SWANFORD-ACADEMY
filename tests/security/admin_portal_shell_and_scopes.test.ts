import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { loginUser } from '@/lib/auth/service';
import { hashPassword } from '@/lib/auth/password';
import { GET as getAdminNotifications, PATCH as patchAdminNotifications } from '@/app/api/admin/me/notifications/route';
import { GET as getSuperAdminUsers, POST as postSuperAdminUsers } from '@/app/api/super-admin/users/route';
import { GET as getSuperAdminAudit } from '@/app/api/super-admin/audit/route';
import { GET as getFinanceSummary } from '@/app/api/admin/finance/summary/route';
import { GET as getAdminAdmissions } from '@/app/api/admin/admissions/route';
import { RoleCode, UserStatus } from '@prisma/client';

describe('Admin Portal Shell, Scopes & Notification Read Isolation Gate', () => {
  let superAdminToken: string;
  let adminTokenA: string;
  let adminTokenB: string;
  let accountantToken: string;
  let parentToken: string;

  let superAdminUserId: string;
  let adminUserAId: string;
  let adminUserBId: string;
  let accountantUserId: string;
  let parentUserId: string;

  let sharedNotificationId: string;
  let targetedNotificationAId: string;

  const testPassword = 'AdminGatePassword2026!';
  const timestamp = Date.now();

  const superAdminEmail = `super.admin.gate.${timestamp}@swanford.test`;
  const adminEmailA = `admin.a.gate.${timestamp}@swanford.test`;
  const adminEmailB = `admin.b.gate.${timestamp}@swanford.test`;
  const accountantEmail = `accountant.gate.${timestamp}@swanford.test`;
  const parentEmail = `parent.gate.${timestamp}@swanford.test`;

  beforeAll(async () => {
    const hashedPassword = await hashPassword(testPassword);

    const superAdminRole = await prisma.role.findUnique({ where: { code: RoleCode.SUPER_ADMIN } });
    const adminRole = await prisma.role.findUnique({ where: { code: RoleCode.ADMIN } });
    const accountantRole = await prisma.role.findUnique({ where: { code: RoleCode.ACCOUNTANT } });
    const parentRole = await prisma.role.findUnique({ where: { code: RoleCode.PARENT } });

    // 1. Create Super Admin User
    const su = await prisma.user.create({
      data: {
        email: superAdminEmail,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: superAdminRole!.id } },
      },
    });
    superAdminUserId = su.id;

    // 2. Create Admin User A
    const ua = await prisma.user.create({
      data: {
        email: adminEmailA,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: adminRole!.id } },
      },
    });
    adminUserAId = ua.id;

    // 3. Create Admin User B
    const ub = await prisma.user.create({
      data: {
        email: adminEmailB,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: adminRole!.id } },
      },
    });
    adminUserBId = ub.id;

    // 4. Create Accountant User
    const uacc = await prisma.user.create({
      data: {
        email: accountantEmail,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: accountantRole!.id } },
      },
    });
    accountantUserId = uacc.id;

    // 5. Create Parent User (Non-staff)
    const up = await prisma.user.create({
      data: {
        email: parentEmail,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: parentRole!.id } },
      },
    });
    parentUserId = up.id;

    // Log all users in to acquire real session tokens
    const suSession = await loginUser({ email: superAdminEmail, password: testPassword });
    superAdminToken = suSession.sessionToken;

    const uaSession = await loginUser({ email: adminEmailA, password: testPassword });
    adminTokenA = uaSession.sessionToken;

    const ubSession = await loginUser({ email: adminEmailB, password: testPassword });
    adminTokenB = ubSession.sessionToken;

    const uaccSession = await loginUser({ email: accountantEmail, password: testPassword });
    accountantToken = uaccSession.sessionToken;

    const upSession = await loginUser({ email: parentEmail, password: testPassword });
    parentToken = upSession.sessionToken;

    // 6. Create a Shared Admin Notification (recipientUserId = null)
    const sharedNotif = await prisma.notification.create({
      data: {
        idempotencyKey: `shared-notif-${timestamp}`,
        category: 'GENERAL',
        channel: 'EMAIL',
        templateName: 'system_notice',
        recipientEmail: 'all-admins@swanford.example.com',
        recipientUserId: null,
        subject: `Shared Security Notice ${timestamp}`,
        bodyText: 'Security maintenance scheduled for upcoming maintenance window.',
        status: 'DELIVERED',
        metadata: { priority: 'high' },
      },
    });
    sharedNotificationId = sharedNotif.id;

    // 7. Create a Targeted Private Notification for Admin A only
    const targetedNotif = await prisma.notification.create({
      data: {
        idempotencyKey: `targeted-notif-${timestamp}`,
        category: 'SECURITY',
        channel: 'EMAIL',
        templateName: 'security_alert',
        recipientEmail: adminEmailA,
        recipientUserId: adminUserAId,
        subject: `Private Security Alert for Admin A ${timestamp}`,
        bodyText: 'Confidential alert intended exclusively for User A.',
        status: 'DELIVERED',
        metadata: { priority: 'critical' },
      },
    });
    targetedNotificationAId = targetedNotif.id;
  });

  afterAll(async () => {
    // Clean up test notifications and users
    if (sharedNotificationId) {
      await prisma.notification.delete({ where: { id: sharedNotificationId } }).catch(() => {});
    }
    if (targetedNotificationAId) {
      await prisma.notification.delete({ where: { id: targetedNotificationAId } }).catch(() => {});
    }

    const testEmails = [superAdminEmail, adminEmailA, adminEmailB, accountantEmail, parentEmail];
    for (const email of testEmails) {
      const u = await prisma.user.findUnique({ where: { email } });
      if (u) {
        await prisma.session.deleteMany({ where: { userId: u.id } });
        await prisma.userRole.deleteMany({ where: { userId: u.id } });
        await prisma.user.delete({ where: { id: u.id } });
      }
    }
  });

  // =========================================================================
  // REQUIREMENT 1: NOTIFICATIONS SCOPE & USER-LEVEL ISOLATION
  // =========================================================================
  describe('Notification Read Tracking & Authorization Isolation', () => {
    it('initial state: both Admin A and Admin B see the shared notification as UNREAD', async () => {
      // Admin A fetch
      const reqA = new NextRequest('http://localhost/api/admin/me/notifications', {
        headers: { cookie: `swanford_session=${adminTokenA}` },
      });
      const resA = await getAdminNotifications(reqA);
      expect(resA.status).toBe(200);
      const dataA = await resA.json();
      const sharedItemA = dataA.notifications.find((n: any) => n.id === sharedNotificationId);
      expect(sharedItemA).toBeDefined();
      expect(sharedItemA.isRead).toBe(false);

      // Admin B fetch
      const reqB = new NextRequest('http://localhost/api/admin/me/notifications', {
        headers: { cookie: `swanford_session=${adminTokenB}` },
      });
      const resB = await getAdminNotifications(reqB);
      expect(resB.status).toBe(200);
      const dataB = await resB.json();
      const sharedItemB = dataB.notifications.find((n: any) => n.id === sharedNotificationId);
      expect(sharedItemB).toBeDefined();
      expect(sharedItemB.isRead).toBe(false);
    });

    it('Admin A marks shared notification as read: ONLY Admin A state becomes read, Admin B remains UNREAD', async () => {
      // Admin A marks as read
      const patchReqA = new NextRequest('http://localhost/api/admin/me/notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          cookie: `swanford_session=${adminTokenA}`,
        },
        body: JSON.stringify({ notificationId: sharedNotificationId }),
      });
      const patchResA = await patchAdminNotifications(patchReqA);
      expect(patchResA.status).toBe(200);

      // Verify Admin A now sees it as READ
      const reqA = new NextRequest('http://localhost/api/admin/me/notifications', {
        headers: { cookie: `swanford_session=${adminTokenA}` },
      });
      const resA = await getAdminNotifications(reqA);
      const dataA = await resA.json();
      const itemA = dataA.notifications.find((n: any) => n.id === sharedNotificationId);
      expect(itemA.isRead).toBe(true);

      // CRITICAL CHECK: Verify Admin B still sees it as UNREAD!
      const reqB = new NextRequest('http://localhost/api/admin/me/notifications', {
        headers: { cookie: `swanford_session=${adminTokenB}` },
      });
      const resB = await getAdminNotifications(reqB);
      const dataB = await resB.json();
      const itemB = dataB.notifications.find((n: any) => n.id === sharedNotificationId);
      expect(itemB.isRead).toBe(false); // MUST REMAIN FALSE
    });

    it('Admin B marks shared notification as read: now both have independent read records', async () => {
      // Admin B marks as read
      const patchReqB = new NextRequest('http://localhost/api/admin/me/notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          cookie: `swanford_session=${adminTokenB}`,
        },
        body: JSON.stringify({ notificationId: sharedNotificationId }),
      });
      const patchResB = await patchAdminNotifications(patchReqB);
      expect(patchResB.status).toBe(200);

      // Verify both have individual tracking in relational userNotificationRead table
      const readA = await prisma.userNotificationRead.findUnique({
        where: {
          notificationId_userId: {
            notificationId: sharedNotificationId,
            userId: adminUserAId,
          },
        },
      });
      const readB = await prisma.userNotificationRead.findUnique({
        where: {
          notificationId_userId: {
            notificationId: sharedNotificationId,
            userId: adminUserBId,
          },
        },
      });
      expect(readA).toBeDefined();
      expect(readB).toBeDefined();
    });

    it('user-level authorization: Admin B CANNOT mark Admin A’s targeted notification as read', async () => {
      // Admin B tries to PATCH Admin A's private notification
      const patchReq = new NextRequest('http://localhost/api/admin/me/notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          cookie: `swanford_session=${adminTokenB}`,
        },
        body: JSON.stringify({ notificationId: targetedNotificationAId }),
      });
      const patchRes = await patchAdminNotifications(patchReq);
      expect(patchRes.status).toBe(403);
      const json = await patchRes.json();
      expect(json.error).toContain('Access denied');
    });

    it('non-staff user (Parent) is rejected with 403 on admin notifications API', async () => {
      const req = new NextRequest('http://localhost/api/admin/me/notifications', {
        headers: { cookie: `swanford_session=${parentToken}` },
      });
      const res = await getAdminNotifications(req);
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // REQUIREMENT 2: SIDEBAR & DIRECT API ACCESS MATRIX
  // =========================================================================
  describe('Direct Route & API Access Matrix (SUPER_ADMIN vs ADMIN vs ACCOUNTANT)', () => {
    it('/api/super-admin/users: SUPER_ADMIN succeeds (200), ADMIN and ACCOUNTANT are DENIED (403)', async () => {
      // Super Admin: Allowed
      const suReq = new NextRequest('http://localhost/api/super-admin/users', {
        headers: { cookie: `swanford_session=${superAdminToken}` },
      });
      const suRes = await getSuperAdminUsers(suReq);
      expect(suRes.status).toBe(200);

      // Admin: Denied (403)
      const aReq = new NextRequest('http://localhost/api/super-admin/users', {
        headers: { cookie: `swanford_session=${adminTokenA}` },
      });
      const aRes = await getSuperAdminUsers(aReq);
      expect(aRes.status).toBe(403);
      const aJson = await aRes.json();
      expect(aJson.error).toContain('users:manage');

      // Accountant: Denied (403)
      const accReq = new NextRequest('http://localhost/api/super-admin/users', {
        headers: { cookie: `swanford_session=${accountantToken}` },
      });
      const accRes = await getSuperAdminUsers(accReq);
      expect(accRes.status).toBe(403);
    });

    it('prevent privilege escalation: ADMIN and ACCOUNTANT cannot create new users via POST /api/super-admin/users', async () => {
      const payload = {
        email: `escalation.attempt.${Date.now()}@swanford.test`,
        roles: [RoleCode.SUPER_ADMIN],
      };

      // Admin attempt: Denied (403)
      const aPost = new NextRequest('http://localhost/api/super-admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `swanford_session=${adminTokenA}`,
        },
        body: JSON.stringify(payload),
      });
      const aRes = await postSuperAdminUsers(aPost);
      expect(aRes.status).toBe(403);

      // Accountant attempt: Denied (403)
      const accPost = new NextRequest('http://localhost/api/super-admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `swanford_session=${accountantToken}`,
        },
        body: JSON.stringify(payload),
      });
      const accRes = await postSuperAdminUsers(accPost);
      expect(accRes.status).toBe(403);
    });

    it('Audit Trail: SUPER_ADMIN and ADMIN have read access (200), ACCOUNTANT is DENIED (403)', async () => {
      // Super Admin: Allowed
      const suReq = new NextRequest('http://localhost/api/super-admin/audit', {
        headers: { cookie: `swanford_session=${superAdminToken}` },
      });
      const suRes = await getSuperAdminAudit(suReq);
      expect(suRes.status).toBe(200);

      // Admin: Allowed (Admin has AUDIT_LOG_VIEW permission)
      const aReq = new NextRequest('http://localhost/api/super-admin/audit', {
        headers: { cookie: `swanford_session=${adminTokenA}` },
      });
      const aRes = await getSuperAdminAudit(aReq);
      expect(aRes.status).toBe(200);

      // Accountant: Denied (403)
      const accReq = new NextRequest('http://localhost/api/super-admin/audit', {
        headers: { cookie: `swanford_session=${accountantToken}` },
      });
      const accRes = await getSuperAdminAudit(accReq);
      expect(accRes.status).toBe(403);
    });

    it('Finance Summary: SUPER_ADMIN, ADMIN, and ACCOUNTANT all have access (200)', async () => {
      const suReq = new NextRequest('http://localhost/api/admin/finance/summary', {
        headers: { cookie: `swanford_session=${superAdminToken}` },
      });
      const suRes = await getFinanceSummary(suReq);
      expect(suRes.status).toBe(200);

      const aReq = new NextRequest('http://localhost/api/admin/finance/summary', {
        headers: { cookie: `swanford_session=${adminTokenA}` },
      });
      const aRes = await getFinanceSummary(aReq);
      expect(aRes.status).toBe(200);

      const accReq = new NextRequest('http://localhost/api/admin/finance/summary', {
        headers: { cookie: `swanford_session=${accountantToken}` },
      });
      const accRes = await getFinanceSummary(accReq);
      expect(accRes.status).toBe(200);
    });

    it('Admissions Centre: SUPER_ADMIN, ADMIN, and ACCOUNTANT have view access (200)', async () => {
      const suReq = new NextRequest('http://localhost/api/admin/admissions', {
        headers: { cookie: `swanford_session=${superAdminToken}` },
      });
      const suRes = await getAdminAdmissions(suReq);
      expect(suRes.status).toBe(200);

      const aReq = new NextRequest('http://localhost/api/admin/admissions', {
        headers: { cookie: `swanford_session=${adminTokenA}` },
      });
      const aRes = await getAdminAdmissions(aReq);
      expect(aRes.status).toBe(200);

      const accReq = new NextRequest('http://localhost/api/admin/admissions', {
        headers: { cookie: `swanford_session=${accountantToken}` },
      });
      const accRes = await getAdminAdmissions(accReq);
      expect(accRes.status).toBe(200);
    });
  });
});
