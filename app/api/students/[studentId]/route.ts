import { NextRequest } from 'next/server';
import { getStudentByStudentId } from '@/lib/db';
import { handleOptions } from '@/lib/cors';
import { fail, ok } from '@/lib/responses';

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { studentId: string } },
) {
  try {
    const { studentId } = params;
    const student = await getStudentByStudentId(studentId);

    if (!student) {
      return fail(request, `Student ${studentId} was not found.`, 404);
    }

    return ok(request, {
      studentId: student.student_id,
      firstName: student.first_name,
      lastName: student.last_name,
      fullName: `${student.first_name} ${student.last_name}`,
      classCode: student.class_code,
      className: student.class_name,
      feeAmount: Number(student.fee_amount ?? 0),
      feeDisplay: new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        maximumFractionDigits: 0,
      }).format(Number(student.fee_amount ?? 0)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return fail(request, 'Unable to fetch student details.', 500, { message });
  }
}
