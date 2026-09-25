import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { listStudents } from '@/lib/students/student_service';
import { loginUser, requestPasswordResetOtp } from '@/lib/auth/service';
import { RoleCode, UserStatus } from '@prisma/client';
import { hashPassword } from '@/lib/auth/password';
import { clearRateLimit } from '@/lib/security/rate_limiter';

describe('Security Audit — SQL Injection Defense & Parameterization', () => {
  let adminActor: any;
  const adminEmail = `admin.sqli.${Date.now()}@example.com`;

  const SQLI_PAYLOADS = [
    "' OR '1'='1",
    "'; DROP TABLE students; --",
    "' UNION SELECT id, email, password_hash, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL FROM users --",
    "admin'--",
    "1' AND 1=cast((SELECT table_name FROM information_schema.tables LIMIT 1) AS int) --",
    "' OR 1=1 #",
    "/* comment */ ' OR ''='",
    "'; SELECT pg_sleep(5); --",
    "' UNION ALL SELECT NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL --",
  ];

  beforeAll(async () => {
    const adminRole = await prisma.role.findUnique({ where: { code: RoleCode.ADMIN } });
    const user = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await hashPassword('AdminPass2026!'),
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: adminRole!.id } },
      },
    });

    adminActor = {
      id: user.id,
      email: user.email,
      roles: [RoleCode.ADMIN],
      status: UserStatus.ACTIVE,
    };
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: adminEmail } });
  });

  describe('Search & Filtering Parameterization Defense', () => {
    it('safely handles malicious SQL injection payloads in student search without executing SQL or erroring', async () => {
      for (const payload of SQLI_PAYLOADS) {
        // Execute search with payload
        const result = await listStudents(adminActor, { search: payload });

        // Must return safe object structure
        expect(result).toBeDefined();
        expect(Array.isArray(result.students)).toBe(true);
        expect(typeof result.total).toBe('number');

        // Payload was treated as literal text; no students returned unless literal match exists
        for (const s of result.students) {
          const matches =
            s.firstName.toLowerCase().includes(payload.toLowerCase()) ||
            s.lastName.toLowerCase().includes(payload.toLowerCase()) ||
            s.admissionNumber.toLowerCase().includes(payload.toLowerCase());
          expect(matches).toBe(true);
        }
      }
    });

    it('safely handles SQL injection payloads in filter options without executing SQL syntax', async () => {
      const maliciousFilter = "'; DROP TABLE programmes; --";

      // Attempting to pass SQL injection as programmeId is safely rejected by Prisma schema validation or returns empty
      try {
        const result = await listStudents(adminActor, { programmeId: maliciousFilter });
        expect(result.students).toEqual([]);
      } catch (err: unknown) {
        // Prisma strongly types UUIDs and rejects malformed characters before SQL execution
        expect(String(err)).toMatch(/UUID|invalid/i);
      }

      // Verify programmes table was not dropped
      const progCount = await prisma.programme.count();
      expect(progCount).toBeGreaterThan(0);
    });
  });

  describe('Authentication Query Defense', () => {
    it('rejects SQL injection authentication bypass attempts in loginUser', async () => {
      const bypassAttempts = [
        "' OR '1'='1",
        "admin'--",
        "superadmin@swanfordacademy.edu.ng' OR '1'='1",
        "' UNION SELECT id FROM users WHERE '1'='1",
        "admin'/*",
      ];

      for (const emailPayload of bypassAttempts) {
        await expect(
          loginUser({ email: emailPayload, password: 'password123' })
        ).rejects.toThrow('Invalid email or password');
      }
    });

    it('rejects SQL injection payloads in password reset request with safe anti-enumeration response', async () => {
      for (const payload of SQLI_PAYLOADS) {
        clearRateLimit('forgot_pw_ip:127.0.0.1');
        clearRateLimit(`forgot_pw_email:${payload.trim().toLowerCase()}`);
        const res = await requestPasswordResetOtp(payload);
        expect(res.success).toBe(true);
        expect(res.message).toContain('If an account exists with this email');

        // Verify no orphan reset records were created
        const resets = await prisma.passwordReset.findMany({
          where: { user: { email: payload } },
        });
        expect(resets).toHaveLength(0);
      }
    });
  });
});
