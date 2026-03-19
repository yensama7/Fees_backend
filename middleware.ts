import { NextRequest, NextResponse } from 'next/server';
import { buildSecurityHeaders, getAdminSessionFromRequest } from '@/lib/auth';
import { createClient as refreshSupabaseSession } from '@/utils/supabase/middleware';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdminPage = pathname.startsWith('/admin');
  const isLoginPage = pathname === '/admin/login';
  const session = getAdminSessionFromRequest(request);

  if (isAdminPage && !isLoginPage && !session) {
    const loginUrl = new URL('/admin/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return buildSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  if (isLoginPage && session) {
    return buildSecurityHeaders(NextResponse.redirect(new URL('/admin', request.url)));
  }

  return buildSecurityHeaders(refreshSupabaseSession(request));
}

export const config = {
  matcher: ['/admin/:path*', '/((?!_next/static|_next/image|favicon.ico).*)'],
};
