import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { getSchoolProfile, updateSchoolProfile, UpdateSchoolProfileInput } from '@/lib/academic/school_profile';
import { AuthorizationError, requirePermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await requirePermission(actor, PermissionCode.SYSTEM_CONFIG_MANAGE);

    const profile = await getSchoolProfile();
    return NextResponse.json({ success: true, profile });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to retrieve school settings.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await requirePermission(actor, PermissionCode.SYSTEM_CONFIG_MANAGE);

    const body = (await request.json()) as UpdateSchoolProfileInput;
    const updated = await updateSchoolProfile(actor.id, body);

    return NextResponse.json({
      success: true,
      profile: updated,
      message: 'School operational parameters saved and persisted successfully.',
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to update school settings.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
