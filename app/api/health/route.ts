import { NextRequest } from 'next/server';
import { ensureSchema, getDatabaseUnavailableMessage, isDatabaseConnectionError } from '@/lib/db';
import { fail, ok } from '@/lib/responses';
import { handleOptions } from '@/lib/cors';

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function GET(request: NextRequest) {
  try {
    await ensureSchema();

    return ok(request, {
      status: 'healthy',
      connectedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = isDatabaseConnectionError(error)
      ? getDatabaseUnavailableMessage()
      : error instanceof Error
        ? error.message
        : 'Unknown error';
    return fail(request, 'Database connection failed', isDatabaseConnectionError(error) ? 503 : 500, { message });
  }
}
