import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { prisma } from '@/lib/prisma';
import { RoleCode } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const actorRoles = actor.roles || [];
    const isSuperAdmin = actorRoles.includes('SUPER_ADMIN');
    const isAdmin = actorRoles.includes('ADMIN');
    const isTeacher = actorRoles.includes('TEACHER');
    const isParentOnly = actorRoles.length > 0 && actorRoles.every((r) => r === 'PARENT');

    if (isParentOnly) {
      return NextResponse.json({
        recipients: [],
        classes: [],
        canBroadcast: false,
        canInitiate: false,
      });
    }

    if (isTeacher && !isSuperAdmin && !isAdmin) {
      // Teachers may only message Admins and Super Admins
      const adminUsers = await prisma.user.findMany({
        where: {
          userRoles: {
            some: {
              role: { code: { in: [RoleCode.SUPER_ADMIN, RoleCode.ADMIN] } },
            },
          },
          status: 'ACTIVE',
        },
        select: {
          id: true,
          email: true,
          userRoles: { select: { role: { select: { code: true, name: true } } } },
        },
        orderBy: { email: 'asc' },
      });

      return NextResponse.json({
        recipients: adminUsers.map((u) => ({
          id: u.id,
          name: u.email,
          role: u.userRoles[0]?.role?.name || 'Administrator',
        })),
        classes: [],
        canBroadcast: false,
        canInitiate: true,
      });
    }

    if (isAdmin && !isSuperAdmin) {
      // Admins: can message Super Admin and Teachers (operational only, strictly no parent messaging, no broadcast)
      const operationalUsers = await prisma.user.findMany({
        where: {
          userRoles: {
            some: {
              role: { code: { in: [RoleCode.SUPER_ADMIN, RoleCode.TEACHER] } },
            },
          },
          status: 'ACTIVE',
        },
        select: {
          id: true,
          email: true,
          userRoles: { select: { role: { select: { code: true, name: true } } } },
          teacherProfile: { select: { firstName: true, lastName: true } },
        },
        orderBy: { email: 'asc' },
      });

      return NextResponse.json({
        recipients: operationalUsers.map((u) => ({
          id: u.id,
          name: u.teacherProfile
            ? `${u.teacherProfile.firstName} ${u.teacherProfile.lastName} (${u.email})`
            : u.email,
          role: u.userRoles[0]?.role?.name || 'Staff',
          category: 'Staff',
        })),
        classes: [],
        canBroadcast: false,
        canInitiate: true,
      });
    }

    // Super Admin: Can message all staff, teachers, guardians, broadcast, and classes
    const [staffUsers, guardians, classes] = await Promise.all([
      prisma.user.findMany({
        where: {
          userRoles: {
            some: {
              role: {
                code: { in: [RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.TEACHER] },
              },
            },
          },
          status: 'ACTIVE',
        },
        select: {
          id: true,
          email: true,
          userRoles: { select: { role: { select: { code: true, name: true } } } },
          teacherProfile: { select: { firstName: true, lastName: true } },
        },
        orderBy: { email: 'asc' },
      }),
      prisma.guardian.findMany({
        where: { user: { status: 'ACTIVE' } },
        select: {
          id: true,
          userId: true,
          firstName: true,
          lastName: true,
          email: true,
        },
        orderBy: { lastName: 'asc' },
      }),
      prisma.schoolClass.findMany({
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const recipientList = [
      ...staffUsers.map((u) => ({
        id: u.id,
        name: u.teacherProfile
          ? `${u.teacherProfile.firstName} ${u.teacherProfile.lastName} (${u.email})`
          : u.email,
        role: u.userRoles[0]?.role?.name || 'Staff',
        category: 'Staff',
      })),
      ...guardians
        .filter((g) => g.userId)
        .map((g) => ({
          id: g.userId!,
          name: `${g.firstName} ${g.lastName} (${g.email})`,
          role: 'Parent / Guardian',
          category: 'Parent',
        })),
    ];

    return NextResponse.json({
      recipients: recipientList,
      classes,
      canBroadcast: true,
      canInitiate: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve recipients.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
