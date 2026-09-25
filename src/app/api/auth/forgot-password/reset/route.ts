import { NextRequest, NextResponse } from 'next/server';
import { confirmPasswordResetWithTicket } from '@/lib/auth/service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, resetTicket, newPassword } = body;

    if (!email || !resetTicket || !newPassword) {
      return NextResponse.json(
        { error: 'Email, reset authorization ticket, and new password are required.' },
        { status: 400 }
      );
    }

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    const ipAddress =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';

    await confirmPasswordResetWithTicket({
      email,
      resetTicket,
      newPassword,
      ipAddress,
    });

    return NextResponse.json({
      success: true,
      message: 'Your password has been successfully updated. You may now sign in with your new password.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update password.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
