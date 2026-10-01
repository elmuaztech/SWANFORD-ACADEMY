import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import {
  getAdminUserDetails,
  updateAdminUserProfile,
  deleteAdminUser,
} from '@/lib/admin/admin_service';
import { AuthorizationError } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const user = await getAdminUserDetails(actor, id);
    return NextResponse.json(user);
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to retrieve user details.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
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
    const updated = await updateAdminUserProfile(actor, id, body);
    return NextResponse.json({
      success: true,
      message: `User account updated successfully for ${updated.email}.`,
      user: updated,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to update user account.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const PUT = PATCH;

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const deleted = await deleteAdminUser(actor, id);
    return NextResponse.json({
      success: true,
      message: `User account (${deleted.email}) and all dependent access rights permanently deleted.`,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to delete user account.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
