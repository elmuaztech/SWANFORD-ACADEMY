import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { listSchoolClasses, createSchoolClass } from '@/lib/academic/class_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const programmeId = searchParams.get('programmeId') || undefined;
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const classes = await prisma.schoolClass.findMany({
      where: {
        ...(programmeId && { programmeId }),
        ...(!includeInactive && { isActive: true }),
      },
      orderBy: { displayOrder: 'asc' },
      include: {
        programme: true,
        teacherScopes: {
          include: {
            teacher: {
              include: {
                user: true,
              },
            },
            subject: true,
          },
        },
        _count: {
          select: {
            enrollments: true,
          },
        },
      },
    });

    return NextResponse.json({ items: classes });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to list classes.';
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
    const newClass = await createSchoolClass(actor.id, body);

    return NextResponse.json(
      {
        success: true,
        class: newClass,
        message: 'Class created successfully.',
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to create class.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
