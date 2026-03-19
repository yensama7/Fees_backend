import { NextRequest, NextResponse } from 'next/server';
import { buildSecurityHeaders, clearAdminSessionResponse } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type');

  if (contentType?.includes('application/json')) {
    const response = NextResponse.json({ success: true });
    return buildSecurityHeaders(clearAdminSessionResponse(response));
  }

  const response = NextResponse.redirect(new URL('/admin/login', request.url), { status: 303 });
  return buildSecurityHeaders(clearAdminSessionResponse(response));
}
