import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth/request_auth';
import { requirePermission, AuthorizationError } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { FeeApplicableGender } from '@prisma/client';
import { getConfiguredApplicationFormFeeKobo } from '@/lib/admissions/fee_calculation';
import { toUserFacingError } from '@/lib/ui/error_messages';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const CreateFeeStructureSchema = z.object({
  name: z.string().min(2, 'Fee structure name is required').max(100).trim(),
  academicSessionId: z.string().uuid('Academic session is required'),
  academicTermId: z.string().uuid('Academic term is required'),
  programmeId: z.string().trim(), // UUID or 'ALL'
  schoolClassId: z.string().uuid().optional().nullable(),
  applicableGender: z.nativeEnum(FeeApplicableGender).default(FeeApplicableGender.ALL),
  isAdmissionFee: z.boolean().default(false),
  items: z
    .array(
      z.object({
        name: z.string().min(1, 'Fee item name is required').trim(),
        amountNaira: z.number().nonnegative('Amount cannot be negative'),
      })
    )
    .min(1, 'At least one fee item (e.g. Tuition, Books) is required'),
});

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await requirePermission(actor, PermissionCode.FINANCE_INVOICE_VIEW);

    const formFeeKobo = await getConfiguredApplicationFormFeeKobo(prisma);

    const feeStructures = await prisma.feeStructure.findMany({
      include: {
        academicSession: { select: { id: true, name: true, isCurrent: true } },
        academicTerm: { select: { id: true, name: true, termCode: true, isCurrent: true } },
        programme: { select: { id: true, name: true, code: true } },
        schoolClass: { select: { id: true, name: true } },
        feeItems: {
          orderBy: { amountKobo: 'desc' },
        },
      },
      orderBy: [
        { academicSession: { startDate: 'desc' } },
        { academicTerm: { termCode: 'asc' } },
        { programme: { displayOrder: 'asc' } },
        { createdAt: 'desc' },
      ],
    });

    const serialized = feeStructures.map((fs) => {
      const totalKobo = fs.feeItems.reduce(
        (sum, item) => sum + item.amountKobo,
        BigInt(0)
      );
      return {
        id: fs.id,
        name: fs.name,
        sessionId: fs.academicSessionId,
        sessionName: fs.academicSession.name,
        termId: fs.academicTermId,
        termName: fs.academicTerm.name,
        programmeId: fs.programmeId,
        programmeName: fs.programme.name,
        programmeCode: fs.programme.code,
        schoolClassId: fs.schoolClassId,
        className: fs.schoolClass?.name || 'All Classes in Programme',
        applicableGender: fs.applicableGender,
        isAdmissionFee: fs.isAdmissionFee,
        isActive: fs.isActive,
        totalAmountKobo: totalKobo.toString(),
        totalAmountNaira: Number(totalKobo) / 100,
        items: fs.feeItems.map((item) => ({
          id: item.id,
          name: item.name,
          amountKobo: item.amountKobo.toString(),
          amountNaira: Number(item.amountKobo) / 100,
        })),
        createdAt: fs.createdAt.toISOString(),
      };
    });

    return NextResponse.json({
      success: true,
      formFeeKobo: formFeeKobo.toString(),
      formFeeNaira: Number(formFeeKobo) / 100,
      feeStructures: serialized,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: toUserFacingError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await requirePermission(actor, PermissionCode.FEE_STRUCTURE_MANAGE);

    const body = await request.json();
    const validated = CreateFeeStructureSchema.parse(body);

    // If programmeId is 'ALL', create a fee structure for every active programme
    let targetProgrammeIds: string[] = [];
    if (validated.programmeId === 'ALL') {
      const programmes = await prisma.programme.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      if (programmes.length === 0) {
        return NextResponse.json({ error: 'No active academic programmes found.' }, { status: 400 });
      }
      targetProgrammeIds = programmes.map((p) => p.id);
    } else {
      targetProgrammeIds = [validated.programmeId];
    }

    const createdStructures = [];

    for (const progId of targetProgrammeIds) {
      const fs = await prisma.feeStructure.create({
        data: {
          name: validated.name,
          academicSessionId: validated.academicSessionId,
          academicTermId: validated.academicTermId,
          programmeId: progId,
          schoolClassId: validated.programmeId === 'ALL' ? null : (validated.schoolClassId || null),
          applicableGender: validated.applicableGender,
          isAdmissionFee: validated.isAdmissionFee,
          feeItems: {
            create: validated.items.map((item) => ({
              name: item.name,
              amountKobo: BigInt(Math.round(item.amountNaira * 100)),
            })),
          },
        },
        include: {
          feeItems: true,
          programme: true,
        },
      });
      createdStructures.push(fs);
    }

    // Create Audit Log
    try {
      await prisma.auditLog.create({
        data: {
          userId: actor.id,
          action: 'FEE_STRUCTURE_CREATE',
          entityType: 'FEE_STRUCTURE',
          entityId: createdStructures[0]?.id || 'MULTIPLE',
          newValues: {
            name: validated.name,
            programmesCount: targetProgrammeIds.length,
            itemsCount: validated.items.length,
          },
        },
      });
    } catch {
      // Non-blocking audit log
    }

    return NextResponse.json({
      success: true,
      message: `Fee structure created successfully for ${createdStructures.length} programme(s).`,
      count: createdStructures.length,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Invalid input.' }, { status: 400 });
    }
    const userError = toUserFacingError(error);
    return NextResponse.json({ error: userError.message || userError.title }, { status: 500 });
  }
}
