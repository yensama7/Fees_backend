import { NextRequest, NextResponse } from 'next/server';

const allowedOriginPatterns = [/https?:\/\/[a-z0-9-]+\.lovable\.app$/i, /https?:\/\/[a-z0-9-]+\.lovable\.dev$/i];

function resolveAllowedOrigin(origin: string | null): string | null {
  if (!origin) {
    return null;
  }

  if (allowedOriginPatterns.some((pattern) => pattern.test(origin))) {
    return origin;
  }

  return null;
}

export function withCors(request: NextRequest, response: NextResponse): NextResponse {
  const origin = request.headers.get('origin');
  const allowedOrigin = resolveAllowedOrigin(origin);

  if (allowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Allow-Credentials', 'false');
  response.headers.set('Vary', 'Origin');
  return response;
}

export function handleOptions(request: NextRequest): NextResponse {
  const allowedOrigin = resolveAllowedOrigin(request.headers.get('origin'));
  if (!allowedOrigin) {
    return new NextResponse(null, { status: 403 });
  }

  return withCors(request, new NextResponse(null, { status: 204 }));
}
