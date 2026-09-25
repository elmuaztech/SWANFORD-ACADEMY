import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { uploadAndStoreProfilePhoto } from '@/lib/media/media_service';
import { ImageValidationError } from '@/lib/media/image_processor';
import { prisma } from '@/lib/prisma';
import { AuthorizationError, requirePermission } from '@/lib/auth/authorization';
import { PermissionCode } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await requirePermission(actor.id, PermissionCode.USER_MANAGE);

    const { id: targetUserId } = await params;

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User record not found.' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No image file provided in upload request.' },
        { status: 400 }
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Image file size exceeds maximum permitted limit of 5 MB.' },
        { status: 413 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Process image through optimization pipeline
    const asset = await uploadAndStoreProfilePhoto({
      buffer,
      originalFilename: file.name,
      uploadedById: actor.id,
    });

    // Attach to user profile
    await prisma.user.update({
      where: { id: targetUserId },
      data: { profilePhotoId: asset.id },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: 'USER_PROFILE_PHOTO_UPDATED',
        entityType: 'User',
        entityId: targetUserId,
        newValues: { profilePhotoId: asset.id },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'User profile photo updated successfully.',
      assetId: asset.id,
      url: `/api/media/${asset.id}`,
      fileSize: asset.fileSize,
      width: asset.width,
      height: asset.height,
      mimeType: asset.mimeType,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    if (error instanceof ImageValidationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : 'Failed to upload user profile photo.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
