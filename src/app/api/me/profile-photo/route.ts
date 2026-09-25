import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { uploadAndStoreProfilePhoto } from '@/lib/media/media_service';
import { ImageValidationError } from '@/lib/media/image_processor';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
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

    // Process image through optimization pipeline (Sharp, WebP, 320x320, stripping EXIF)
    const asset = await uploadAndStoreProfilePhoto({
      buffer,
      originalFilename: file.name,
      uploadedById: user.id,
    });

    // Attach to user profile
    await prisma.user.update({
      where: { id: user.id },
      data: { profilePhotoId: asset.id },
    });

    return NextResponse.json({
      success: true,
      message: 'Profile photo uploaded and optimized successfully.',
      assetId: asset.id,
      url: `/api/media/${asset.id}`,
      fileSize: asset.fileSize,
      width: asset.width,
      height: asset.height,
      mimeType: asset.mimeType,
    });
  } catch (error: unknown) {
    if (error instanceof ImageValidationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : 'Failed to upload profile photo.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
