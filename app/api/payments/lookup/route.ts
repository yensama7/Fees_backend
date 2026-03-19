import { NextRequest } from 'next/server';
import { lookupPaymentDetails } from '@/lib/db';
import { handleOptions } from '@/lib/cors';
import { fail, ok } from '@/lib/responses';

const nairaFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { studentIds?: string[] };

    if (!Array.isArray(body.studentIds)) {
      return fail(request, 'studentIds must be an array of student ID strings.', 400);
    }

    const result = await lookupPaymentDetails(body.studentIds);

    return ok(request, {
      students: result.students.map((student) => ({
        studentId: student.student_id,
        firstName: student.first_name,
        lastName: student.last_name,
        fullName: `${student.first_name} ${student.last_name}`,
        classCode: student.class_code,
        className: student.class_name,
        feeAmount: Number(student.fee_amount ?? 0),
        feeDisplay: nairaFormatter.format(Number(student.fee_amount ?? 0)),
      })),
      missingStudentIds: result.missingStudentIds,
      totalFee: result.totalFee,
      totalFeeDisplay: nairaFormatter.format(result.totalFee),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return fail(request, 'Unable to look up payment details.', 500, { message });
  }
}
