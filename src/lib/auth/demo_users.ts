import { RoleCode, UserStatus } from '@prisma/client';
import { SafeUser } from './service';

export const PORTAL_DESTINATIONS: Record<string, string> = {
  SUPER_ADMIN: '/admin',
  ADMIN: '/admin',
  ACCOUNTANT: '/admin/finance',
  TEACHER: '/teacher',
  PARENT: '/parent',
};

/**
 * Test-only metadata and redirect mapping.
 * Strictly prohibited in production environments.
 */
export function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DEMO_USERS is strictly prohibited in production.');
  }
}

assertNotProduction();

export const DEMO_USERS: Record<string, { user: SafeUser; redirectUrl: string }> = {
  SUPER_ADMIN: {
    redirectUrl: '/admin',
    user: {
      id: 'bbf45459-0ffa-419a-b0f9-56d6bfdf50f3',
      email: 'superadmin@swanfordacademy.edu.ng',
      phoneNumber: '+2348030004455',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
      lastLoginAt: new Date(),
      createdAt: new Date('2026-01-01T00:00:00Z'),
      roles: [RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.ACCOUNTANT, RoleCode.TEACHER, RoleCode.PARENT],
    },
  },
  ADMIN: {
    redirectUrl: '/admin',
    user: {
      id: '00000000-0000-0000-0001-000000000002',
      email: 'admin@swanfordacademy.edu.ng',
      phoneNumber: '+2348030003344',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
      lastLoginAt: new Date(),
      createdAt: new Date('2026-01-01T00:00:00Z'),
      roles: [RoleCode.ADMIN],
    },
  },
  ACCOUNTANT: {
    redirectUrl: '/admin/finance',
    user: {
      id: '00000000-0000-0000-0001-000000000003',
      email: 'accountant@swanfordacademy.edu.ng',
      phoneNumber: '+2348030005566',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
      lastLoginAt: new Date(),
      createdAt: new Date('2026-01-01T00:00:00Z'),
      roles: [RoleCode.ACCOUNTANT],
    },
  },
  TEACHER: {
    redirectUrl: '/teacher',
    user: {
      id: '00000000-0000-0000-0001-000000000004',
      email: 'teacher@swanfordacademy.edu.ng',
      phoneNumber: '+2348030002233',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
      lastLoginAt: new Date(),
      createdAt: new Date('2026-01-01T00:00:00Z'),
      teacherId: '00000000-0000-0000-0002-000000000004',
      roles: [RoleCode.TEACHER],
    },
  },
  PARENT: {
    redirectUrl: '/parent',
    user: {
      id: '00000000-0000-0000-0001-000000000005',
      email: 'parent@swanfordacademy.edu.ng',
      phoneNumber: '+2348030001122',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
      lastLoginAt: new Date(),
      createdAt: new Date('2026-01-01T00:00:00Z'),
      guardianId: '00000000-0000-0000-0002-000000000005',
      roles: [RoleCode.PARENT],
    },
  },
};
