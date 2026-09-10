import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { requirePermission, AuthorizationError } from '@/lib/auth/authorization';
import { PermissionCode, PERMISSION_DEFINITIONS, SYSTEM_ROLE_PERMISSIONS } from '@/lib/auth/permissions';
import { SCHOOL_PROFILE } from '@/lib/constants';
import { LAGOS_TIMEZONE } from '@/lib/config/timezone';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await requirePermission(actor, PermissionCode.SYSTEM_CONFIG_MANAGE);

    const [sessions, feeStructures, programmes] = await Promise.all([
      prisma.academicSession.findMany({
        include: { terms: true },
        orderBy: { startDate: 'desc' },
      }),
      prisma.feeStructure.findMany({
        include: { feeItems: true, programme: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.programme.findMany({
        include: { classes: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const serializedFeeStructures = feeStructures.map((fs) => ({
      ...fs,
      feeItems: fs.feeItems.map((item) => ({
        ...item,
        amountKobo: item.amountKobo.toString(),
      })),
    }));

    return NextResponse.json({
      schoolProfile: {
        ...SCHOOL_PROFILE,
        location: 'PLOT 212, DR NUHU MUHAMMADU SANUSI WAY, DUTSE, JIGAWA STATE',
        motto: 'Illuminating the Path to Success.',
        bankAccount: {
          bank: 'Jaiz Bank',
          accountName: 'Swanford Academy',
          accountNumber: '0012031162',
        },
      },
      timezone: LAGOS_TIMEZONE,
      academicSessions: sessions,
      feeStructures: serializedFeeStructures,
      programmes,
      permissions: Object.values(PERMISSION_DEFINITIONS),
      rolePermissions: SYSTEM_ROLE_PERMISSIONS,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to retrieve system configuration.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
