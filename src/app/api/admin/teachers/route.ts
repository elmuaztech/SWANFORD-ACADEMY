import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { listAdminTeachers, createAdminTeacher } from '@/lib/admin/admin_service';
import { AuthorizationError } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;
    const programmeId = searchParams.get('programmeId') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0;

    const result = await listAdminTeachers(actor, { search, programmeId, limit, offset });
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to list teachers.';
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
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';

    const teacher = await createAdminTeacher(actor, body, ipAddress);

    return NextResponse.json(
      {
        success: true,
        teacher,
        message: 'Teacher profile provisioned successfully with activation email dispatched.',
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    if (error && typeof error === 'object' && 'code' in error && (error as any).code === 'P2002') {
      const target = (error as any).meta?.target;
      if (Array.isArray(target) && target.includes('phone_number')) {
        return NextResponse.json(
          { error: 'This phone number is already registered to another user account. Please use a unique phone number.' },
          { status: 400 }
        );
      }
      if (Array.isArray(target) && target.includes('email')) {
        return NextResponse.json(
          { error: 'This email address is already registered in the system.' },
          { status: 400 }
        );
      }
      if (Array.isArray(target) && target.includes('staff_id_number')) {
        return NextResponse.json(
          { error: 'This Staff ID is already assigned to another educator. Please use a different Staff ID.' },
          { status: 400 }
        );
      }
    }
    const message = error instanceof Error ? error.message : 'Failed to create teacher account.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
