import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { getAuthorizedMedia } from '@/lib/media/media_service';
import { AuthorizationError } from '@/lib/auth/authorization';

/**
 * Swanford Academy — Secure Media Asset Delivery Endpoint
 * Master Specification Reference: Work Package B Final Addendum (Media & Profile Photos)
 *
 * Rules:
 * 1. Server-authorized access control (IDOR prevention).
 * 2. Optimized WebP binary streaming directly from disk (zero PostgreSQL binary bloat).
 * 3. HTTP 304 Not Modified support via ETag for bandwidth efficiency.
 * 4. Private caching headers.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: 'Media asset ID is required.' },
        { status: 400 }
      );
    }

    const actor = await getAuthUser(request);

    const { asset, buffer } = await getAuthorizedMedia(id, actor);

    // Bandwidth & Resource Efficiency: ETag conditional request check
    const ifNoneMatch = request.headers.get('if-none-match');
    if (ifNoneMatch && asset.checksum && ifNoneMatch === `"${asset.checksum}"`) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          'ETag': `"${asset.checksum}"`,
          'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800',
        },
      });
    }

    // Convert Buffer to Uint8Array for Next.js / Web Response compatibility
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': asset.mimeType || 'image/webp',
        'Content-Length': asset.fileSize.toString(),
        'ETag': `"${asset.checksum}"`,
        'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: 'An error occurred while retrieving the media asset.' },
      { status: 500 }
    );
  }
}
