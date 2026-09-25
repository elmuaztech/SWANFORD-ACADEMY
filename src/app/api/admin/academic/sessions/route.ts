import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { requirePermission, AuthorizationError } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { prisma } from '@/lib/prisma';
import { TermCode, AcademicSessionStatus, AcademicTermStatus, AdmissionCycleStatus, ProgrammeAvailabilityStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/academic/sessions
 * Retrieves all academic sessions with terms from PostgreSQL.
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const sessions = await prisma.academicSession.findMany({
      include: {
        terms: {
          orderBy: { startDate: 'asc' },
        },
      },
      orderBy: { startDate: 'desc' },
    });

    return NextResponse.json({ sessions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve academic sessions.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/admin/academic/sessions
 * Creates a new academic session and automatically initializes First Term, Second Term, and Third Term.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await requirePermission(actor, PermissionCode.SYSTEM_CONFIG_MANAGE);

    const body = await request.json().catch(() => ({}));
    const { name, startDate, endDate } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Session name is required (e.g. 2027/2028).' }, { status: 400 });
    }

    const trimmedName = name.trim();
    const sessionMatch = trimmedName.match(/^(\d{4})\/(\d{4})$/);
    if (!sessionMatch) {
      return NextResponse.json(
        { error: 'Session name must follow the YYYY/YYYY format (e.g. 2027/2028).' },
        { status: 400 }
      );
    }

    const startYear = parseInt(sessionMatch[1], 10);
    const endYear = parseInt(sessionMatch[2], 10);
    if (endYear !== startYear + 1) {
      return NextResponse.json(
        { error: 'Academic session must span consecutive years (e.g. 2027/2028).' },
        { status: 400 }
      );
    }

    // Check for existing session name
    const existing = await prisma.academicSession.findUnique({
      where: { name: trimmedName },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Academic session "${trimmedName}" already exists.` },
        { status: 400 }
      );
    }

    // Default dates if not explicitly provided
    const sessionStart = startDate ? new Date(startDate) : new Date(Date.UTC(startYear, 8, 1)); // Sept 1
    const sessionEnd = endDate ? new Date(endDate) : new Date(Date.UTC(endYear, 6, 31)); // July 31

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create AcademicSession
      const session = await tx.academicSession.create({
        data: {
          name: trimmedName,
          startDate: sessionStart,
          endDate: sessionEnd,
          status: AcademicSessionStatus.UPCOMING,
          isCurrent: false,
        },
      });

      // 2. Automatically create First Term, Second Term, and Third Term
      const term1Start = new Date(Date.UTC(startYear, 8, 1));
      const term1End = new Date(Date.UTC(startYear, 11, 15));

      const term2Start = new Date(Date.UTC(endYear, 0, 10));
      const term2End = new Date(Date.UTC(endYear, 3, 10));

      const term3Start = new Date(Date.UTC(endYear, 4, 2));
      const term3End = new Date(Date.UTC(endYear, 6, 25));

      await tx.academicTerm.createMany({
        data: [
          {
            academicSessionId: session.id,
            termCode: TermCode.FIRST,
            name: 'First Term',
            startDate: term1Start,
            endDate: term1End,
            status: AcademicTermStatus.UPCOMING,
            isCurrent: false,
          },
          {
            academicSessionId: session.id,
            termCode: TermCode.SECOND,
            name: 'Second Term',
            startDate: term2Start,
            endDate: term2End,
            status: AcademicTermStatus.UPCOMING,
            isCurrent: false,
          },
          {
            academicSessionId: session.id,
            termCode: TermCode.THIRD,
            name: 'Third Term',
            startDate: term3Start,
            endDate: term3End,
            status: AcademicTermStatus.UPCOMING,
            isCurrent: false,
          },
        ],
      });

      // 3. Create default Main Admission Cycle for this session
      const cycleCode = `ADM-${startYear}-MAIN`;
      const existingCycle = await tx.admissionCycle.findUnique({ where: { code: cycleCode } });
      if (!existingCycle) {
        const cycle = await tx.admissionCycle.create({
          data: {
            academicSessionId: session.id,
            code: cycleCode,
            name: `${trimmedName} Main Admission`,
            startDate: new Date(Date.UTC(startYear, 7, 1)),
            endDate: new Date(Date.UTC(startYear, 9, 30)),
            status: AdmissionCycleStatus.UPCOMING,
            description: `Main admission window for ${trimmedName} academic session.`,
          },
        });

        // Initialize programmes as OPEN
        const activeProgs = await tx.programme.findMany({ where: { isActive: true } });
        for (const prog of activeProgs) {
          await tx.admissionCycleProgramme.create({
            data: {
              admissionCycleId: cycle.id,
              programmeId: prog.id,
              status: ProgrammeAvailabilityStatus.OPEN,
            },
          });
        }
      }

      // 4. Audit Log
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'ACADEMIC_SESSION_CREATED',
          entityType: 'AcademicSession',
          entityId: session.id,
          newValues: {
            name: session.name,
            startDate: session.startDate,
            endDate: session.endDate,
          },
        },
      });

      return tx.academicSession.findUnique({
        where: { id: session.id },
        include: { terms: { orderBy: { startDate: 'asc' } } },
      });
    });

    return NextResponse.json({
      success: true,
      message: `Academic Session "${trimmedName}" created successfully with First Term, Second Term, and Third Term.`,
      session: result,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to create academic session.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
