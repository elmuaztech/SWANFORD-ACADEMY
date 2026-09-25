import { NextRequest, NextResponse } from 'next/server';
import { RoleCode } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth/request_auth';
import { AuthorizationError } from '@/lib/auth/authorization';
import { uploadAndStoreProfilePhoto, replaceProfilePhoto } from '@/lib/media/media_service';
import { ImageValidationError } from '@/lib/media/image_processor';

export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * GET /api/admin/me/photo
 * Retrieves the currently authenticated admin's profile photo URL and asset ID.
 */
export async function GET(request: NextRequest) {
  try {
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

    const user = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { profilePhotoId: true },
    });

    const url = user?.profilePhotoId ? `/api/media/${user.profilePhotoId}` : null;

    return NextResponse.json({
      success: true,
      assetId: user?.profilePhotoId || null,
      url,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve admin profile photo.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Unified photo upload & replacement handler for POST and PUT.
 */
async function handlePhotoUpload(request: NextRequest) {
  try {
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

    await replaceProfilePhoto({ type: 'USER', id: actor.id }, newAssetId, actor);

    return NextResponse.json({
      success: true,
      assetId: newAssetId,
      url: `/api/media/${newAssetId}`,
      message: 'Profile photo updated successfully.',
    });
  } catch (error: unknown) {
    if (error instanceof ImageValidationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to update admin profile photo.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handlePhotoUpload(request);
}

export async function PUT(request: NextRequest) {
  return handlePhotoUpload(request);
}
