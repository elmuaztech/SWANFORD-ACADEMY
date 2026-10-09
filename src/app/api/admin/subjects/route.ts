import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { listSubjects, createSubject } from '@/lib/academic/subject_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { prisma } from '@/lib/prisma';

import { z } from 'zod';

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

    const subjects = await prisma.subject.findMany({
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
            schoolClass: true,
          },
        },
      },
    });

    return NextResponse.json({ items: subjects });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to list subjects.';
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
    const subject = await createSubject(actor.id, body);

    return NextResponse.json(
      {
        success: true,
        subject,
        message: 'Subject created successfully.',
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      return NextResponse.json({ error: issue?.message || 'Invalid subject details.' }, { status: 400 });
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to create subject.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
