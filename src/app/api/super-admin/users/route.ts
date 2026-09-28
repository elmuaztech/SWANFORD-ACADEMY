import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { listAdminUsers, createAdminUser } from '@/lib/admin/admin_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { UserStatus, RoleCode } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;
    const status = (searchParams.get('status') as UserStatus) || undefined;
    const role = (searchParams.get('role') as RoleCode) || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 20;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0;

    const result = await listAdminUsers(actor, { search, status, role, limit, offset });
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to list user accounts.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();
    const { email, phoneNumber, roles, firstName, lastName, status, schoolClassId, programmeId } = body;

    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';

    const newUser = await createAdminUser(
      actor,
      {
        email,
        phoneNumber,
        roles,
        firstName,
        lastName,
        status,
        schoolClassId,
        programmeId,
      },
      ipAddress
    );

    return NextResponse.json({
      success: true,
      message: `User account created successfully for ${newUser.email}. Official welcome email with initial credentials has been dispatched.`,
      user: newUser,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to create user account.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

