import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { getAdminTeacherDetails, updateAdminTeacher } from '@/lib/admin/admin_service';
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

    const teacher = await getAdminTeacherDetails(actor, id);
    return NextResponse.json(teacher);
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to retrieve teacher details.';
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
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';

    const teacher = await updateAdminTeacher(actor, id, body, ipAddress);

    return NextResponse.json({
      success: true,
      teacher,
      message: 'Teacher profile updated successfully.',
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    if (error && typeof error === 'object' && 'code' in error && (error as any).code === 'P2002') {
      const target = (error as any).meta?.target;
      if (Array.isArray(target) && target.includes('phone_number')) {
        return NextResponse.json(
          { error: 'This phone number is already registered to another user account.' },
          { status: 400 }
        );
      }
      if (Array.isArray(target) && target.includes('email')) {
        return NextResponse.json(
          { error: 'This email address is already in use by another account.' },
          { status: 400 }
        );
      }
      if (Array.isArray(target) && target.includes('staff_id_number')) {
        return NextResponse.json(
          { error: 'This Staff ID is already assigned to another educator.' },
          { status: 400 }
        );
      }
    }
    const message = error instanceof Error ? error.message : 'Failed to update teacher profile.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
