import { NextRequest, NextResponse } from 'next/server';
import { withCors } from '@/lib/cors';

export function ok(request: NextRequest, data: unknown, init?: ResponseInit) {
  return withCors(
    request,
    NextResponse.json(
      {
        success: true,
        data,
      },
      init,
    ),
  );
}

export function fail(request: NextRequest, message: string, status = 400, details?: unknown) {
  return withCors(
    request,
    NextResponse.json(
      {
        success: false,
        error: message,
        details,
      },
      { status },
    ),
  );
}
