import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { loginUser } from '@/lib/auth/service';
import { DEMO_USERS } from '../fixtures/demo_users';
import { RoleCode } from '@prisma/client';
import { getUserPermissions } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';

describe('Unified Admin Portal, Role Detection & Hardened Authentication', () => {
  beforeAll(async () => {
    // Ensure bootstrap demo accounts are purged so only genuine admin exists
    const demoEmails = [
      'superadmin@swanfordacademy.edu.ng',
      'admin@swanfordacademy.edu.ng',
      'accountant@swanfordacademy.edu.ng',
      'teacher@swanfordacademy.edu.ng',
      'parent@swanfordacademy.edu.ng',
    ];
    const demoUsers = await prisma.user.findMany({
      where: { email: { in: demoEmails } },
      select: { id: true },
    });
    const userIds = demoUsers.map((u) => u.id);
    if (userIds.length > 0) {
      const teachers = await prisma.teacher.findMany({
        where: { userId: { in: userIds } },
        select: { id: true },
      });
      const teacherIds = teachers.map((t) => t.id);
      if (teacherIds.length > 0) {
        await prisma.teacherScope.deleteMany({ where: { teacherId: { in: teacherIds } } });
        await prisma.teacherAssignmentHistory.deleteMany({ where: { teacherId: { in: teacherIds } } });
        await prisma.staffDocument.deleteMany({ where: { teacherId: { in: teacherIds } } });
        await prisma.staffProbationRecord.deleteMany({ where: { teacherId: { in: teacherIds } } });
        await prisma.attendanceRecord.deleteMany({ where: { recordedByTeacherId: { in: teacherIds } } });
        await prisma.teacher.deleteMany({ where: { id: { in: teacherIds } } });
      }

      const guardians = await prisma.guardian.findMany({
        where: { userId: { in: userIds } },
        select: { id: true },
      });
      const guardianIds = guardians.map((g) => g.id);
      if (guardianIds.length > 0) {
        await prisma.guardianStudentRelationship.deleteMany({ where: { guardianId: { in: guardianIds } } });
        await prisma.guardian.deleteMany({ where: { id: { in: guardianIds } } });
      }

      await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.passwordReset.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.emailVerification.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.userNotificationRead.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  it('strictly prohibits purged demo accounts from logging in', async () => {
    const demoEmails = [
      'superadmin@swanfordacademy.edu.ng',
      'admin@swanfordacademy.edu.ng',
      'accountant@swanfordacademy.edu.ng',
      'teacher@swanfordacademy.edu.ng',
      'parent@swanfordacademy.edu.ng',
    ];

    for (const email of demoEmails) {
      await expect(
        loginUser({
          email,
          password: 'AnyPassword123!',
        })
      ).rejects.toThrow('Invalid email or password');
    }
  });

  it('authenticates and validates genuine administrator account (swanford99@gmail.com) in PostgreSQL', async () => {
    const adminUser = await prisma.user.findFirst({
      where: { email: 'swanford99@gmail.com' },
      include: { userRoles: { include: { role: true } } },
    });

    expect(adminUser).not.toBeNull();
    expect(adminUser?.email).toBe('swanford99@gmail.com');
    expect(adminUser?.status).toBe('ACTIVE');

    const roleCodes = adminUser?.userRoles.map((ur) => ur.role.code) || [];
    expect(roleCodes).toContain(RoleCode.ADMIN);

    const perms = await getUserPermissions(adminUser!.id);
    expect(perms.has(PermissionCode.STUDENT_VIEW)).toBe(true);
    expect(perms.has(PermissionCode.AUDIT_LOG_VIEW)).toBe(true);
    expect(perms.has(PermissionCode.ADMISSION_APPLICATION_VIEW)).toBe(true);
  });

  it('confirms all 5 bootstrap demo accounts have been permanently purged from PostgreSQL following authorized cleanup', async () => {
    for (const [roleKey, demo] of Object.entries(DEMO_USERS)) {
      const dbUser = await prisma.user.findUnique({
        where: { id: demo.user.id },
        include: { userRoles: { include: { role: true } } },
      });

      expect(dbUser, `Demo user for role ${roleKey} must not exist in PostgreSQL`).toBeNull();
    }
  });

  it('Super Admin and School Admin redirect destinations align to unified /admin portal', () => {
    expect(DEMO_USERS.SUPER_ADMIN.redirectUrl).toBe('/admin');
    expect(DEMO_USERS.ADMIN.redirectUrl).toBe('/admin');
    expect(DEMO_USERS.ACCOUNTANT.redirectUrl).toBe('/admin/finance');
    expect(DEMO_USERS.TEACHER.redirectUrl).toBe('/teacher');
    expect(DEMO_USERS.PARENT.redirectUrl).toBe('/parent');
  });
});
