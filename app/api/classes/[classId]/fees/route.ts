import { NextRequest } from 'next/server';
import { upsertClassFee } from '@/lib/db';
import { handleOptions } from '@/lib/cors';
import { getAdminSessionFromRequest } from '@/lib/auth';
import { fail, ok } from '@/lib/responses';

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { classId: string } },
) {
  try {
    if (!(await getAdminSessionFromRequest(request))) {
      return fail(request, 'Admin authentication is required.', 401);
    }

    const { classId } = params;
    const body = (await request.json()) as { feeAmount?: number };

    if (typeof body.feeAmount !== 'number' || Number.isNaN(body.feeAmount)) {
      return fail(request, 'feeAmount must be a valid number.', 400);
    }

    const updatedClass = await upsertClassFee(classId, body.feeAmount);

    return ok(request, {
      message: `Fee for ${classId} saved successfully.`,
      class: {
        classCode: updatedClass.class_code,
        className: updatedClass.class_name,
        feeAmount: Number(updatedClass.fee_amount),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return fail(request, 'Unable to map class fee.', 500, { message });
  }
}
