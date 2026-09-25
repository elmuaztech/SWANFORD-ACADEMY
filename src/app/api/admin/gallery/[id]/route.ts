import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { updateGalleryItem, deleteGalleryItem } from '@/lib/gallery/gallery_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { RoleCode } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * Super Admin Endpoint: Update gallery item metadata, publish status, or replace photo.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    if (!actor.roles?.includes(RoleCode.SUPER_ADMIN)) {
      return NextResponse.json({ error: 'Super Admin privileges required.' }, { status: 403 });
    }

    const contentType = request.headers.get('content-type') || '';
    let updates: any = {};
    let newFileBuffer: Buffer | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (file && file.size > 0) {
        const ab = await file.arrayBuffer();
        newFileBuffer = Buffer.from(ab);
      }

      if (formData.has('title')) updates.title = (formData.get('title') as string).trim();
      if (formData.has('caption')) updates.caption = (formData.get('caption') as string).trim() || null;
      if (formData.has('altText')) updates.altText = (formData.get('altText') as string).trim();
      if (formData.has('category')) updates.category = (formData.get('category') as string).trim();
      if (formData.has('displayOrder')) updates.displayOrder = parseInt(formData.get('displayOrder') as string, 10);
      if (formData.has('isPublished')) updates.isPublished = formData.get('isPublished') === 'true';
    } else {
      const body = await request.json();
      updates = body;
    }

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'Unknown';

    const updated = await updateGalleryItem({
      id,
      data: updates,
      newFileBuffer,
      actor,
      ipAddress,
      userAgent,
    });

    return NextResponse.json({
      success: true,
      item: updated,
      message: 'Gallery item updated successfully.',
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to update gallery item.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Super Admin Endpoint: Delete a gallery item and its underlying media asset.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    if (!actor.roles?.includes(RoleCode.SUPER_ADMIN)) {
      return NextResponse.json({ error: 'Super Admin privileges required.' }, { status: 403 });
    }

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'Unknown';

    await deleteGalleryItem({
      id,
      actor,
      ipAddress,
      userAgent,
    });

    return NextResponse.json({
      success: true,
      message: 'Gallery photograph deleted permanently.',
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to delete gallery item.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
