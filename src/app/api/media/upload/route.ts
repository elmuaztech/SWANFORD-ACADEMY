import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { uploadAndStoreProfilePhoto } from '@/lib/media/media_service';
import { ImageValidationError } from '@/lib/media/image_processor';

/**
 * Swanford Academy — Shared Media Upload Endpoint
 * Master Specification Reference: Work Package B Final Addendum (Media & Profile Photos)
 *
 * Accepts multipart/form-data upload, validates signatures, optimizes to WebP,
 * and records MediaAsset. Never stores the original binary.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided in the upload request.' },
        { status: 400 }
      );
    }

    // 5 MB upload limit guard
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size exceeds maximum permitted limit of 5 MB.' },
        { status: 413 }
      );
    }

    const user = await getAuthUser(request);
    const uploadedById = user?.id;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const asset = await uploadAndStoreProfilePhoto({
      buffer,
      originalFilename: file.name,
      uploadedById,
    });

    return NextResponse.json({
      success: true,
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

    return NextResponse.json(
      { error: 'Failed to process and store media upload.' },
      { status: 500 }
    );
  }
}
