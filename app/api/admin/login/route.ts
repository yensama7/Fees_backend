import { NextRequest, NextResponse } from 'next/server';
import {
  buildSecurityHeaders,
  clearFailedLogins,
  createAdminSessionResponse,
  isLoginRateLimited,
  recordFailedLogin,
  validateAdminCredentials,
} from '@/lib/auth';

function extractCredentials(contentType: string | null, request: NextRequest) {
  if (contentType?.includes('application/json')) {
    return request.json() as Promise<{ username?: string; password?: string; next?: string }>;
  }

  return request.formData().then((formData) => ({
    username: String(formData.get('username') ?? ''),
    password: String(formData.get('password') ?? ''),
    next: String(formData.get('next') ?? '/admin'),
  }));
}

export async function POST(request: NextRequest) {
  const rateLimit = isLoginRateLimited(request);
  if (rateLimit.limited) {
    const response = NextResponse.json(
      {
        success: false,
        error: `Too many login attempts. Try again in ${rateLimit.retryAfter} seconds.`,
      },
      { status: 429 },
    );
    return buildSecurityHeaders(response);
  }

  const contentType = request.headers.get('content-type');
  const { username = '', password = '', next = '/admin' } = await extractCredentials(contentType, request);
  const redirectTarget = next.startsWith('/admin') ? next : '/admin';

  if (!validateAdminCredentials(username, password)) {
    recordFailedLogin(request);

    if (contentType?.includes('application/json')) {
      return buildSecurityHeaders(
        NextResponse.json(
          {
            success: false,
            error: 'Invalid admin credentials.',
          },
          { status: 401 },
        ),
      );
    }

    const loginUrl = new URL('/admin/login', request.url);
    loginUrl.searchParams.set('error', 'Invalid username or password.');
    loginUrl.searchParams.set('next', redirectTarget);
    return buildSecurityHeaders(NextResponse.redirect(loginUrl, { status: 303 }));
  }

  clearFailedLogins(request);

  if (contentType?.includes('application/json')) {
    const response = NextResponse.json({ success: true, data: { redirectTo: redirectTarget } });
    return buildSecurityHeaders(createAdminSessionResponse(response, username));
  }

  const response = NextResponse.redirect(new URL(redirectTarget, request.url), { status: 303 });
  return buildSecurityHeaders(createAdminSessionResponse(response, username));
}
