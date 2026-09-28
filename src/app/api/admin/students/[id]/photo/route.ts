import { NextRequest, NextResponse } from 'next/server';
import { RoleCode } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth/request_auth';
import {
  uploadAndStoreProfilePhoto,
  replaceProfilePhoto,
} from '@/lib/media/media_service';
import { ImageValidationError } from '@/lib/media/image_processor';

export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Swanford Academy — Admin Student Profile Photo Management
 * Allows ADMIN and SUPER_ADMIN to view, upload, replace, or remove a student's profile photo.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: studentId } = await params;
    const actor = await getAuthUser(request);

    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const isStaffAdmin =
      actor.roles?.includes(RoleCode.ADMIN) || actor.roles?.includes(RoleCode.SUPER_ADMIN);

    if (!isStaffAdmin) {
      return NextResponse.json(
        { error: 'Access denied: Admin or Super Admin role required.' },
        { status: 403 }
      );
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, profilePhotoId: true, firstName: true, lastName: true },
    });

    if (!student) {
      return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
    }

    const url = student.profilePhotoId ? `/api/media/${student.profilePhotoId}` : null;

    return NextResponse.json({
      success: true,
      assetId: student.profilePhotoId,
      url,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve student photo.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handlePhotoUpload(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: studentId } = await params;
    const actor = await getAuthUser(request);

    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const isStaffAdmin =
      actor.roles?.includes(RoleCode.ADMIN) || actor.roles?.includes(RoleCode.SUPER_ADMIN);

    if (!isStaffAdmin) {
      return NextResponse.json(
        { error: 'Access denied: Admin or Super Admin role required.' },
        { status: 403 }
      );
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });

    if (!student) {
      return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
    }

    const contentType = request.headers.get('content-type') || '';
    let newAssetId: string;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json({ error: 'Photo file is required.' }, { status: 400 });
      }

      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: 'File size exceeds maximum permitted limit of 5 MB.' },
          { status: 413 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const asset = await uploadAndStoreProfilePhoto({
        buffer,
        uploadedById: actor.id,
      });
      newAssetId = asset.id;
    } else {
      const body = await request.json().catch(() => ({}));
      newAssetId = body.assetId;
      if (!newAssetId) {
        return NextResponse.json({ error: 'assetId is required.' }, { status: 400 });
      }
    }

    await replaceProfilePhoto(
      { type: 'STUDENT', id: studentId },
      newAssetId,
      actor
    );

    return NextResponse.json({
      success: true,
      assetId: newAssetId,
      url: `/api/media/${newAssetId}`,
    });
  } catch (error: unknown) {
    if (error instanceof ImageValidationError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    const message = error instanceof Error ? error.message : 'Failed to update student photo.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handlePhotoUpload(request, context);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handlePhotoUpload(request, context);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: studentId } = await params;
    const actor = await getAuthUser(request);

    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const isStaffAdmin =
      actor.roles?.includes(RoleCode.ADMIN) || actor.roles?.includes(RoleCode.SUPER_ADMIN);

    if (!isStaffAdmin) {
      return NextResponse.json(
        { error: 'Access denied: Admin or Super Admin role required.' },
        { status: 403 }
      );
    }

    await prisma.student.update({
      where: { id: studentId },
      data: { profilePhotoId: null },
    });

    return NextResponse.json({
      success: true,
      message: 'Student profile photo removed successfully.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to remove student photo.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
