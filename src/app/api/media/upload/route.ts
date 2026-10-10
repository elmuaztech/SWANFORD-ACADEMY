import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { uploadAndStoreProfilePhoto } from '@/lib/media/media_service';
import { ImageValidationError, isImageValidationError } from '@/lib/media/image_processor';
import { checkRateLimit, getClientIp } from '@/lib/security/rate_limiter';

/**
 * Swanford Academy — Shared Media Upload Endpoint
 * Master Specification Reference: Work Package B Final Addendum (Media & Profile Photos)
 *
 * Accepts multipart/form-data upload, validates signatures, optimizes to WebP,
 * and records MediaAsset. Never stores the original binary.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rateLimit = checkRateLimit(`media_upload:${ip}`, {
      windowMs: 60_000,
      maxRequests: 15,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many upload attempts. Please wait a moment before trying again.' },
        { status: 429 }
      );
    }

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
    console.error('[Media Upload Error]', error);

    if (isImageValidationError(error)) {
      return NextResponse.json(
        { error: error.message, code: (error as ImageValidationError).code || 'IMAGE_VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const message = error instanceof Error && error.message.startsWith('Access denied')
      ? error.message
      : 'Failed to process and store media upload.';

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
