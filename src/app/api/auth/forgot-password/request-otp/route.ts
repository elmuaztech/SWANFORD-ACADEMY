import { NextRequest, NextResponse } from 'next/server';
import { requestPasswordResetOtp } from '@/lib/auth/service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json(
        { error: 'A valid email address is required.' },
        { status: 400 }
      );
    }

    const ipAddress =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';

    const result = await requestPasswordResetOtp(email, ipAddress);

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unable to process password reset request.';
    const isRateLimit = message.toLowerCase().includes('too many');
    return NextResponse.json(
      { error: message },
      { status: isRateLimit ? 429 : 400 }
    );
  }
}
