import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { assignUserRoles } from '@/lib/admin/admin_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { RoleCode } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();
    const { roleCodes } = body;

    if (!Array.isArray(roleCodes) || roleCodes.length === 0) {
      return NextResponse.json(
        { error: 'An array of role codes (minimum 1 role) is required.' },
        { status: 400 }
      );
    }

    // Validate that all roleCodes are valid
    for (const code of roleCodes) {
      if (!Object.values(RoleCode).includes(code)) {
        return NextResponse.json({ error: `Invalid role code: ${code}` }, { status: 400 });
      }
    }

    const assigned = await assignUserRoles(actor, id, roleCodes as RoleCode[]);
    return NextResponse.json({
      success: true,
      message: 'User roles updated successfully.',
      roles: assigned,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to update user roles.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
