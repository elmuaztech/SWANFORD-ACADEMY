import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Seamlessly unify /super-admin routes into /admin
  if (pathname === '/super-admin' || pathname.startsWith('/super-admin/')) {
    const newPath = pathname.replace('/super-admin', '/admin') || '/admin';
    const redirectUrl = new URL(newPath, req.url);
    redirectUrl.search = req.nextUrl.search;
    return NextResponse.redirect(redirectUrl);
  }

  // 2. Convenience redirects for root /login and /portal
  if (pathname === '/login' || pathname === '/portal') {
    const loginUrl = new URL('/auth/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  const sessionCookie = req.cookies.get('swanford_session')?.value;

  // 3. Protected portal routes: /admin, /teacher, /parent
  const isProtectedPortal =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/teacher') ||
    pathname.startsWith('/parent');

  if (isProtectedPortal && !sessionCookie) {
    const loginUrl = new URL('/auth/login', req.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/super-admin',
    '/super-admin/:path*',
    '/teacher/:path*',
    '/parent/:path*',
    '/login',
    '/portal',
  ],
};
