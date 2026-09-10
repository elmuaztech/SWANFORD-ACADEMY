import { NextRequest, NextResponse } from 'next/server';
import { RoleCode } from '@prisma/client';
import { getAuthUser } from '@/lib/auth/request_auth';
import { AuthorizationError } from '@/lib/auth/authorization';
import { uploadAndStoreProfilePhoto, replaceProfilePhoto } from '@/lib/media/media_service';
import { ImageValidationError } from '@/lib/media/image_processor';

export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest) {
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

      const buffer = Buffer.from(await file.arrayBuffer());
      const asset = await uploadAndStoreProfilePhoto({
        buffer,
        uploadedById: actor.id,
      });
      newAssetId = asset.id;
    } else {
      const body = await request.json();
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
