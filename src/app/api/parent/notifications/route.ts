import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Find guardian profile if exists to match secondary emails or phones
    const guardian = await prisma.guardian.findFirst({
      where: { userId: user.id },
      select: { id: true, email: true },
    });

    const emailConditions: { recipientEmail?: { equals: string; mode: 'insensitive' } }[] = [
      { recipientEmail: { equals: user.email, mode: 'insensitive' } },
    ];
    if (guardian?.email && guardian.email.toLowerCase() !== user.email.toLowerCase()) {
      emailConditions.push({ recipientEmail: { equals: guardian.email, mode: 'insensitive' } });
    }

    const notifications = await prisma.notification.findMany({
      where: {
        OR: [
          { recipientUserId: user.id },
          ...emailConditions,
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        subject: true,
        bodyText: true,
        htmlBody: true,
        category: true,
        status: true,
        sentAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json(notifications);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load notifications';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
