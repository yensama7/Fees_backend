import { NextRequest } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { fail, ok } from '@/lib/responses';
import { handleOptions } from '@/lib/cors';

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function GET(request: NextRequest) {
  try {
    await ensureSchema();
    const [rows] = await pool.query<{ connected_at: string }[]>(`SELECT NOW() AS connected_at`);

    return ok(request, {
      status: 'healthy',
      connectedAt: rows[0]?.connected_at ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return fail(request, 'Database connection failed', 500, { message });
  }
}
