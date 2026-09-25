import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { generateStaffDocument } from '@/lib/staff/staff_lifecycle_service';
import { AuthorizationError, requirePermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';
import { prisma } from '@/lib/prisma';
import { StaffDocumentType } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await requirePermission(actor, PermissionCode.TEACHER_MANAGE);
    const { id: teacherId } = await params;

    const documents = await prisma.staffDocument.findMany({
      where: { teacherId },
      orderBy: { createdAt: 'desc' },
      include: {
        issuedByUser: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    return NextResponse.json({ success: true, documents });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to retrieve staff documents.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { id: teacherId } = await params;
    const body = await request.json();
    const { documentType } = body;

    if (!documentType || !Object.values(StaffDocumentType).includes(documentType)) {
      return NextResponse.json({ error: 'Valid staff document type is required.' }, { status: 400 });
    }

    const document = await generateStaffDocument(actor, {
      teacherId,
      documentType: documentType as StaffDocumentType,
    });

    return NextResponse.json({
      success: true,
      document,
      message: `Official ${document.title} generated successfully. Review and issue to staff member when ready.`,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to generate staff document.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
