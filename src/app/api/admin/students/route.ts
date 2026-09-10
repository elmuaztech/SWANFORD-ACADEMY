import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { listStudents, createStudent, CreateStudentSchema } from '@/lib/students/student_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { StudentStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;
    const status = (searchParams.get('status') as StudentStatus) || undefined;
    const programmeId = searchParams.get('programmeId') || undefined;
    const schoolClassId = searchParams.get('schoolClassId') || undefined;
    const academicSessionId = searchParams.get('academicSessionId') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0;

    const result = await listStudents(actor, {
      search,
      status,
      programmeId,
      schoolClassId,
      academicSessionId,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to retrieve students.';
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
    const validated = CreateStudentSchema.parse(body);

    const student = await createStudent(actor, validated);
    return NextResponse.json({ success: true, student }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to create student record.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
