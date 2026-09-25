import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { getAdminGalleryItems, createGalleryItem } from '@/lib/gallery/gallery_service';
import { AuthorizationError } from '@/lib/auth/authorization';
import { RoleCode } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * Super Admin Endpoint: List gallery photographs (published & drafts).
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    if (!actor.roles?.includes(RoleCode.SUPER_ADMIN)) {
      return NextResponse.json({ error: 'Super Admin privileges required.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;
    const status = (searchParams.get('status') as 'ALL' | 'PUBLISHED' | 'DRAFT') || undefined;

    const items = await getAdminGalleryItems(actor, { category, status });
    return NextResponse.json({ items, count: items.length });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to list gallery items.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Super Admin Endpoint: Upload a new school gallery photograph.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    if (!actor.roles?.includes(RoleCode.SUPER_ADMIN)) {
      return NextResponse.json({ error: 'Super Admin privileges required to upload gallery photos.' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const title = formData.get('title') as string | null;
    const caption = (formData.get('caption') as string | null) || undefined;
    const altText = formData.get('altText') as string | null;
    const category = (formData.get('category') as string | null) || 'CAMPUS';
    const displayOrder = formData.get('displayOrder') ? parseInt(formData.get('displayOrder') as string, 10) : 0;
    const isPublished = formData.get('isPublished') === 'true';

    if (!file) {
      return NextResponse.json({ error: 'Please provide an image file to upload.' }, { status: 400 });
    }

    if (!title || title.trim().length < 2) {
      return NextResponse.json({ error: 'Photo title must be at least 2 characters.' }, { status: 400 });
    }

    if (!altText || altText.trim().length < 2) {
      return NextResponse.json({ error: 'Accessible alt text is required.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'Unknown';

    const item = await createGalleryItem({
      fileBuffer,
      data: {
        title: title.trim(),
        caption: caption?.trim() || null,
        altText: altText.trim(),
        category,
        displayOrder,
        isPublished,
      },
      actor,
      ipAddress,
      userAgent,
    });

    return NextResponse.json({
      success: true,
      item,
      message: isPublished ? 'Photo uploaded and published.' : 'Photo uploaded as draft.',
    }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to upload gallery photograph.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
