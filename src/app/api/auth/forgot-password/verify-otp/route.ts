import { NextRequest, NextResponse } from 'next/server';
import { verifyPasswordResetOtp } from '@/lib/auth/service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, otp } = body;

    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json(
        { error: 'Email address is required.' },
        { status: 400 }
      );
    }

    if (!otp || typeof otp !== 'string' || !/^\d{4}$/.test(otp.trim())) {
      return NextResponse.json(
        { error: 'Verification code must be exactly 4 numeric digits.' },
        { status: 400 }
      );
    }

    const ipAddress =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';

    const result = await verifyPasswordResetOtp(email, otp, ipAddress);

    if (!result.success) {
      const isLocked = result.attemptsRemaining === 0 || (result.message && result.message.includes('locked'));
      return NextResponse.json(
        {
          error: result.message || 'Invalid verification code.',
          attemptsRemaining: result.attemptsRemaining,
        },
        { status: isLocked ? 429 : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      resetTicket: result.resetTicket,
      message: 'Verification code confirmed. You may now choose your new password.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unable to verify code.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
