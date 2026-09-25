import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { getUnreadMessageCount } from '@/lib/messaging/message_service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ unreadCount: 0 });
    }

    const unreadCount = await getUnreadMessageCount(actor);
    return NextResponse.json({ success: true, unreadCount });
  } catch {
    return NextResponse.json({ unreadCount: 0 });
  }
}
