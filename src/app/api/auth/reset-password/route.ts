import { NextRequest, NextResponse } from 'next/server';
import { confirmPasswordReset } from '@/lib/auth/service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, password } = body;

    if (!token || !password) {
      return NextResponse.json(
        { error: 'Reset token and new password are required.' },
        { status: 400 }
      );
    }

    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    const ipAddress =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';

    await confirmPasswordReset({
      rawToken: token,
      newPassword: password,
      ipAddress,
    });

    return NextResponse.json({
      success: true,
      message: 'Your password has been successfully updated. You may now sign in.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Password reset failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
