import { NextRequest, NextResponse } from 'next/server';
import { getPublicGalleryItems } from '@/lib/gallery/gallery_service';

export const dynamic = 'force-dynamic';

/**
 * Public Endpoint: Returns published school gallery photographs.
 * Query parameters:
 * - category: Filter by category (e.g. CAMPUS, ACADEMICS, ACTIVITIES, FACILITIES, TAHFEEZ, ALL)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;

    const items = await getPublicGalleryItems({ category });

    return NextResponse.json({
      items,
      count: items.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve gallery photographs.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
