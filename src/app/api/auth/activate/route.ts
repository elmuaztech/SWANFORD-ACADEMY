import { NextRequest, NextResponse } from 'next/server';
import { verifyActivationToken, activateAccount } from '@/lib/auth/service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { valid: false, message: 'Activation token is required.' },
        { status: 400 }
      );
    }

    const check = await verifyActivationToken(token);
    if (!check.valid) {
      return NextResponse.json(check, { status: 400 });
    }

    return NextResponse.json(check);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to verify activation token.';
    return NextResponse.json({ valid: false, message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, password } = body;

    if (!token || !password) {
      return NextResponse.json(
        { error: 'Activation token and new password are required.' },
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

    const activatedUser = await activateAccount({
      rawToken: token,
      newPassword: password,
      ipAddress,
    });

    return NextResponse.json({
      success: true,
      message: 'Account activated successfully. You can now log in.',
      user: activatedUser,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Account activation failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
