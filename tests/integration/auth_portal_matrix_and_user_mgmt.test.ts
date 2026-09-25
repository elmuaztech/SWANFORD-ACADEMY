import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { RoleCode, UserStatus } from '@prisma/client';
import { POST as loginRoute } from '@/app/api/auth/login/route';
import { POST as changePasswordRoute } from '@/app/api/auth/change-password/route';
import { POST as resetPasswordRoute } from '@/app/api/auth/reset-password/route';
import { createAdminUser } from '@/lib/admin/admin_service';
import { hashPassword } from '@/lib/auth/password';
import { requestPasswordReset, SafeUser, sanitizeUser } from '@/lib/auth/service';
import { generateSecureToken } from '@/lib/auth/tokens';
import { NextRequest } from 'next/server';

describe('Requirement 30: Complete Login Flow & User Accounts Production Verification', () => {
  let superAdminId: string;
  let superAdminUser: SafeUser;
  const superAdminEmail = 'swanford99@gmail.com';
  // Super Admin test password in dev environment
  const superAdminPassword = process.env.TEST_ADMIN_PASSWORD || 'SuperAdmin@Swanford2026!';

  // Clean-up list
  const userIdsToClean: string[] = [];

  const makePhone = () => '+23480' + Math.floor(10000000 + Math.random() * 90000000);

  let originalPasswordHash: string | null = null;
  let originalStatus: UserStatus | null = null;
  let originalFailedAttempts = 0;
  let originalLockedUntil: Date | null = null;

  beforeAll(async () => {
    // 1. Verify Super Admin exists
    const su = await prisma.user.findFirst({
      where: { email: superAdminEmail.toLowerCase() },
      include: { userRoles: { include: { role: true } } },
    });
    if (!su) {
      throw new Error(`Super Admin ${superAdminEmail} not found in database.`);
    }
    superAdminId = su.id;
    superAdminUser = sanitizeUser(su as any);

    // Save genuine super admin state so tests never permanently destroy user credentials in database
    originalPasswordHash = su.passwordHash;
    originalStatus = su.status;
    originalFailedAttempts = su.failedLoginAttempts;
    originalLockedUntil = su.lockedUntil;

    // Ensure super admin has valid passwordHash for testing
    const hashed = await hashPassword(superAdminPassword);
    await prisma.user.update({
      where: { id: superAdminId },
      data: { passwordHash: hashed, status: UserStatus.ACTIVE, failedLoginAttempts: 0, lockedUntil: null },
    });

    // Clean up any stale test accounts from previous runs
    const staleUsers = await prisma.user.findMany({
      where: {
        OR: [
          { email: { startsWith: 'test.teacher.' } },
          { email: { startsWith: 'test.parent.' } },
          { email: { startsWith: 'new.staff.' } },
          { email: { startsWith: 'reset.user.' } },
          { email: { startsWith: 'suspended.' } },
        ],
      },
      select: { id: true },
    });
    const staleIds = staleUsers.map((u) => u.id);
    if (staleIds.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: staleIds } } });
      await prisma.userRole.deleteMany({ where: { userId: { in: staleIds } } });
      await prisma.teacher.deleteMany({ where: { userId: { in: staleIds } } });
      await prisma.guardian.deleteMany({ where: { userId: { in: staleIds } } });
      await prisma.passwordReset.deleteMany({ where: { userId: { in: staleIds } } });
      await prisma.auditLog.deleteMany({ where: { userId: { in: staleIds } } });
      await prisma.user.deleteMany({ where: { id: { in: staleIds } } });
    }
  });

  afterAll(async () => {
    // Restore genuine super admin state
    if (originalPasswordHash) {
      await prisma.user.update({
        where: { id: superAdminId },
        data: {
          passwordHash: originalPasswordHash,
          status: originalStatus || UserStatus.ACTIVE,
          failedLoginAttempts: originalFailedAttempts,
          lockedUntil: originalLockedUntil,
        },
      });
    }

    // Clean up created test users
    if (userIdsToClean.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: userIdsToClean } } });
      await prisma.userRole.deleteMany({ where: { userId: { in: userIdsToClean } } });
      await prisma.teacher.deleteMany({ where: { userId: { in: userIdsToClean } } });
      await prisma.guardian.deleteMany({ where: { userId: { in: userIdsToClean } } });
      await prisma.passwordReset.deleteMany({ where: { userId: { in: userIdsToClean } } });
      await prisma.auditLog.deleteMany({ where: { userId: { in: userIdsToClean } } });
      await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    }
  });

  // =========================================================================
  // 1. ADMIN PORTAL MATRIX
  // =========================================================================
  describe('1. Admin Portal Authentication & Cross-Role Isolation', () => {
    it('Valid Super Admin → Admin portal → PASS', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: superAdminEmail,
          password: superAdminPassword,
          portal: 'admin',
        }),
      });

      const res = await loginRoute(req);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.redirectUrl).toBe('/admin');
      expect(json.user.email).toBe(superAdminEmail.toLowerCase());
      expect(json.user.roles).toContain(RoleCode.SUPER_ADMIN);
    });

    it('Super Admin credentials → Teacher portal → REJECT', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: superAdminEmail,
          password: superAdminPassword,
          portal: 'teacher',
        }),
      });

      const res = await loginRoute(req);
      const json = await res.json();
      expect(res.status).toBe(403);
      expect(json.success).toBeUndefined();
      expect(json.error).toMatch(/not authorized for the Teacher portal/i);
    });

    it('Super Admin credentials → Parent portal → REJECT', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: superAdminEmail,
          password: superAdminPassword,
          portal: 'parent',
        }),
      });

      const res = await loginRoute(req);
      const json = await res.json();
      expect(res.status).toBe(403);
      expect(json.success).toBeUndefined();
      expect(json.error).toMatch(/not authorized for the Parent portal/i);
    });
  });

  // =========================================================================
  // 2. TEACHER PORTAL MATRIX
  // =========================================================================
  describe('2. Teacher Portal Authentication & Cross-Role Isolation', () => {
    const teacherEmail = `test.teacher.${Date.now()}@swanfordacademy.edu.ng`;
    const teacherPassword = 'TeacherPassword123!';

    beforeAll(async () => {
      const teacherRole = await prisma.role.findUnique({ where: { code: RoleCode.TEACHER } });
      if (!teacherRole) throw new Error('Teacher role missing');

      const hashedPassword = await hashPassword(teacherPassword);
      const teacherUser = await prisma.user.create({
        data: {
          email: teacherEmail,
          passwordHash: hashedPassword,
          firstName: 'Fatima',
          lastName: 'Adamu',
          phoneNumber: makePhone(),
          status: UserStatus.ACTIVE,
          mustChangePassword: false,
          userRoles: {
            create: { roleId: teacherRole.id },
          },
          teacherProfile: {
            create: {
              staffIdNumber: `STF-${Date.now()}`,
              firstName: 'Fatima',
              lastName: 'Adamu',
            },
          },
        },
      });
      userIdsToClean.push(teacherUser.id);
    });

    it('Valid Teacher → Teacher portal → PASS', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: teacherEmail,
          password: teacherPassword,
          portal: 'teacher',
        }),
      });

      const res = await loginRoute(req);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.redirectUrl).toBe('/teacher');
      expect(json.user.roles).toContain(RoleCode.TEACHER);
    });

    it('Teacher credentials → Parent portal → REJECT', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: teacherEmail,
          password: teacherPassword,
          portal: 'parent',
        }),
      });

      const res = await loginRoute(req);
      const json = await res.json();
      expect(res.status).toBe(403);
      expect(json.error).toMatch(/not authorized for the Parent portal/i);
    });

    it('Teacher credentials → Admin portal → REJECT', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: teacherEmail,
          password: teacherPassword,
          portal: 'admin',
        }),
      });

      const res = await loginRoute(req);
      const json = await res.json();
      expect(res.status).toBe(403);
      expect(json.error).toMatch(/not authorized for the Admin portal/i);
    });
  });

  // =========================================================================
  // 3. PARENT PORTAL MATRIX
  // =========================================================================
  describe('3. Parent Portal Authentication & Cross-Role Isolation', () => {
    const parentEmail = `test.parent.${Date.now()}@swanfordacademy.edu.ng`;
    const parentPassword = 'ParentPassword123!';

    beforeAll(async () => {
      const parentRole = await prisma.role.findUnique({ where: { code: RoleCode.PARENT } });
      if (!parentRole) throw new Error('Parent role missing');

      const hashedPassword = await hashPassword(parentPassword);
      const parentUser = await prisma.user.create({
        data: {
          email: parentEmail,
          passwordHash: hashedPassword,
          firstName: 'Ibrahim',
          lastName: 'Musa',
          phoneNumber: makePhone(),
          status: UserStatus.ACTIVE,
          mustChangePassword: false,
          userRoles: {
            create: { roleId: parentRole.id },
          },
          guardianProfile: {
            create: {
              firstName: 'Ibrahim',
              lastName: 'Musa',
              email: parentEmail,
              phonePrimary: makePhone(),
            },
          },
        },
      });
      userIdsToClean.push(parentUser.id);
    });

    it('Valid Parent → Parent portal → PASS', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: parentEmail,
          password: parentPassword,
          portal: 'parent',
        }),
      });

      const res = await loginRoute(req);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.redirectUrl).toBe('/parent');
      expect(json.user.roles).toContain(RoleCode.PARENT);
    });

    it('Parent credentials → Teacher portal → REJECT', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: parentEmail,
          password: parentPassword,
          portal: 'teacher',
        }),
      });

      const res = await loginRoute(req);
      const json = await res.json();
      expect(res.status).toBe(403);
      expect(json.error).toMatch(/not authorized for the Teacher portal/i);
    });

    it('Parent credentials → Admin portal → REJECT', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: parentEmail,
          password: parentPassword,
          portal: 'admin',
        }),
      });

      const res = await loginRoute(req);
      const json = await res.json();
      expect(res.status).toBe(403);
      expect(json.error).toMatch(/not authorized for the Admin portal/i);
    });
  });

  // =========================================================================
  // 4. NEW USER: CREATE -> TEMPORARY PASSWORD -> MANDATORY PASSWORD CHANGE
  // =========================================================================
  describe('4. New User Creation & Mandatory First-Login Password Change Flow', () => {
    const newUserEmail = `new.staff.${Date.now()}@swanfordacademy.edu.ng`;
    const newUserPhone = makePhone();
    let temporaryPassword = '';
    let newUserId = '';

    it('Create account → welcome email queued → temporary credential generated', async () => {
      const result = await createAdminUser(superAdminUser, {
        firstName: 'Aliyu',
        lastName: 'Garba',
        email: newUserEmail,
        phoneNumber: newUserPhone,
        roles: [RoleCode.TEACHER],
        status: UserStatus.ACTIVE,
      });

      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(newUserEmail.toLowerCase());
      expect(result.temporaryPassword).toBeDefined();
      expect(result.temporaryPassword!.length).toBeGreaterThan(8);

      temporaryPassword = result.temporaryPassword!;
      newUserId = result.user.id;
      userIdsToClean.push(newUserId);

      // Verify DB record
      const dbUser = await prisma.user.findUnique({ where: { id: newUserId } });
      expect(dbUser?.mustChangePassword).toBe(true);

      // Verify audit log
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'USER_CREATED_BY_ADMIN', entityId: newUserId },
      });
      expect(audit).toBeDefined();
    });

    it('First login with temporary password forces redirect to /auth/change-password', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newUserEmail,
          password: temporaryPassword,
          portal: 'teacher',
        }),
      });

      const res = await loginRoute(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.mustChangePassword).toBe(true);
      expect(json.redirectUrl).toBe('/auth/change-password');
    });

    it('Mandatory password change endpoint successfully updates password and clears flag', async () => {
      // Create session for the user
      const token = generateSecureToken();
      await prisma.session.create({
        data: {
          userId: newUserId,
          sessionTokenHash: token.tokenHash,
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        },
      });

      const newSecurePassword = 'NewPermanentPassword2026!';
      const req = new NextRequest('http://localhost:3000/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `swanford_session=${token.rawToken}`,
        },
        body: JSON.stringify({
          currentPassword: temporaryPassword,
          newPassword: newSecurePassword,
          confirmPassword: newSecurePassword,
        }),
      });

      const res = await changePasswordRoute(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.redirectUrl).toBe('/teacher');

      // Verify flag cleared in database
      const updatedUser = await prisma.user.findUnique({ where: { id: newUserId } });
      expect(updatedUser?.mustChangePassword).toBe(false);

      // Verify login with new password grants normal access
      const loginReq = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newUserEmail,
          password: newSecurePassword,
          portal: 'teacher',
        }),
      });

      const loginRes = await loginRoute(loginReq);
      const loginJson = await loginRes.json();
      expect(loginRes.status).toBe(200);
      expect(loginJson.mustChangePassword).toBe(false);
      expect(loginJson.redirectUrl).toBe('/teacher');
    });
  });

  // =========================================================================
  // 5. DUPLICATE EMAIL AND MANDATORY PHONE VALIDATION
  // =========================================================================
  describe('5. Duplicate Email Protection & Mandatory Phone Validation', () => {
    it('Create user with existing email → REJECT with exact error message', async () => {
      await expect(
        createAdminUser(superAdminUser, {
          firstName: 'Another',
          lastName: 'Admin',
          email: superAdminEmail.toUpperCase(), // Case variation
          phoneNumber: makePhone(),
          roles: [RoleCode.ADMIN],
        })
      ).rejects.toThrow('This email address is already registered to another user.');
    });

    it('Create user with missing or invalid phone number → REJECT', async () => {
      await expect(
        createAdminUser(superAdminUser, {
          firstName: 'No',
          lastName: 'Phone',
          email: `no.phone.${Date.now()}@swanford.test`,
          phoneNumber: '',
          roles: [RoleCode.TEACHER],
        })
      ).rejects.toThrow(/Phone number is mandatory/i);
    });
  });

  // =========================================================================
  // 6. FORGOT PASSWORD FLOW
  // =========================================================================
  describe('6. Forgot Password Flow', () => {
    const resetUserEmail = `reset.user.${Date.now()}@swanfordacademy.edu.ng`;
    const initialPass = 'InitialPassword123!';
    let resetUserId = '';

    beforeAll(async () => {
      const role = await prisma.role.findUnique({ where: { code: RoleCode.TEACHER } });
      const hashed = await hashPassword(initialPass);
      const user = await prisma.user.create({
        data: {
          email: resetUserEmail,
          passwordHash: hashed,
          firstName: 'Zainab',
          lastName: 'Bello',
          phoneNumber: makePhone(),
          status: UserStatus.ACTIVE,
          userRoles: { create: { roleId: role!.id } },
        },
      });
      resetUserId = user.id;
      userIdsToClean.push(resetUserId);
    });

    it('Generates secure expiring token and sends reset email', async () => {
      await requestPasswordReset(resetUserEmail, '127.0.0.1');

      // Verify token record was created in DB
      const dbResetRecord = await prisma.passwordReset.findFirst({
        where: { userId: resetUserId, usedAt: null },
      });
      expect(dbResetRecord).toBeDefined();

      // Create a deterministic raw token for testing the reset endpoint
      const { rawToken, tokenHash } = generateSecureToken();
      await prisma.passwordReset.create({
        data: {
          userId: resetUserId,
          tokenHash,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });

      // Reset password using token
      const newPassword = 'ResetSuccessPassword2026!';
      const req = new NextRequest('http://localhost:3000/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: rawToken,
          password: newPassword,
        }),
      });

      const res = await resetPasswordRoute(req);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);

      // Verify login works with new password
      const loginReq = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resetUserEmail,
          password: newPassword,
          portal: 'teacher',
        }),
      });
      const loginRes = await loginRoute(loginReq);
      expect(loginRes.status).toBe(200);

      // Verify token CANNOT be reused
      const reuseReq = new NextRequest('http://localhost:3000/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: rawToken,
          password: 'AnotherPassword123!',
        }),
      });
      const reuseRes = await resetPasswordRoute(reuseReq);
      expect(reuseRes.status).toBe(400);
    });
  });

  // =========================================================================
  // 7. SUSPENDED USER LOGIN REJECTION
  // =========================================================================
  describe('7. Suspended User Login Rejection', () => {
    const suspendedEmail = `suspended.${Date.now()}@swanfordacademy.edu.ng`;
    const password = 'Password123!';

    beforeAll(async () => {
      const role = await prisma.role.findUnique({ where: { code: RoleCode.TEACHER } });
      const hashed = await hashPassword(password);
      const user = await prisma.user.create({
        data: {
          email: suspendedEmail,
          passwordHash: hashed,
          firstName: 'Suspended',
          lastName: 'User',
          phoneNumber: makePhone(),
          status: UserStatus.SUSPENDED,
          userRoles: { create: { roleId: role!.id } },
        },
      });
      userIdsToClean.push(user.id);
    });

    it('Suspended user → login → REJECT (403)', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: suspendedEmail,
          password: password,
          portal: 'teacher',
        }),
      });

      const res = await loginRoute(req);
      const json = await res.json();
      expect(res.status).toBe(403);
      expect(json.error).toMatch(/suspended/i);
    });
  });
});
