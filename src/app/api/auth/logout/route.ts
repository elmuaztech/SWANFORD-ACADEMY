import { NextRequest, NextResponse } from 'next/server';
import { logoutUser } from '@/lib/auth/service';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('swanford_session')?.value;
  if (token) {
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || undefined;
    await logoutUser(token, ipAddress);
  }
  const response = NextResponse.json({ success: true });
  response.cookies.delete('swanford_session');
  return response;
}

