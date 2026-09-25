import { NextRequest, NextResponse } from 'next/server';
import { verifyEmail } from '@/lib/auth/service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/auth/login?error=Invalid+verification+link', req.url));
  }

  try {
    await verifyEmail(token);
    return NextResponse.redirect(new URL('/auth/login?verified=true', req.url));
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? encodeURIComponent(err.message) : 'Invalid+or+expired+link';
    return NextResponse.redirect(new URL(`/auth/login?error=${errorMsg}`, req.url));
  }
}
