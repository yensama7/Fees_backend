import { NextRequest } from 'next/server';
import { assignStudentToClass, getStudentsByClassId, removeStudentFromClass } from '@/lib/db';
import { handleOptions } from '@/lib/cors';
import { getAdminSessionFromRequest } from '@/lib/auth';
import { fail, ok } from '@/lib/responses';

function ensureAdmin(request: NextRequest) {
  if (!getAdminSessionFromRequest(request)) {
    return fail(request, 'Admin authentication is required.', 401);
  }

  return null;
}

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { classId: string } },
) {
  try {
    const unauthorized = ensureAdmin(request);
    if (unauthorized) {
      return unauthorized;
    }

    const { classId } = params;
    const students = await getStudentsByClassId(classId);

    return ok(request, {
      classId,
      count: students.length,
      students: students.map((student) => ({
        studentId: student.student_id,
        firstName: student.first_name,
        lastName: student.last_name,
        fullName: `${student.first_name} ${student.last_name}`,
        classCode: student.class_code,
        className: student.class_name,
        feeAmount: Number(student.fee_amount ?? 0),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return fail(request, 'Unable to list students for the class.', 500, { message });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { classId: string } },
) {
  try {
    const unauthorized = ensureAdmin(request);
    if (unauthorized) {
      return unauthorized;
    }

    const { classId } = params;
    const body = (await request.json()) as {
      studentId?: string;
      firstName?: string;
      lastName?: string;
    };

    if (!body.studentId) {
      return fail(request, 'studentId is required.', 400);
    }

    const student = await assignStudentToClass({
      classId,
      studentId: body.studentId,
      firstName: body.firstName,
      lastName: body.lastName,
    });

    return ok(
      request,
      {
        message: `Student ${body.studentId} assigned to ${classId}.`,
        student: student
          ? {
              studentId: student.student_id,
              firstName: student.first_name,
              lastName: student.last_name,
              fullName: `${student.first_name} ${student.last_name}`,
              classCode: student.class_code,
              className: student.class_name,
              feeAmount: Number(student.fee_amount ?? 0),
            }
          : null,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return fail(request, 'Unable to add student to class.', 500, { message });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { classId: string } },
) {
  try {
    const unauthorized = ensureAdmin(request);
    if (unauthorized) {
      return unauthorized;
    }

    const { classId } = params;
    const studentId = request.nextUrl.searchParams.get('studentId');

    if (!studentId) {
      return fail(request, 'studentId query parameter is required.', 400);
    }

    const removed = await removeStudentFromClass(classId, studentId);
    if (!removed) {
      return fail(request, `Student ${studentId} is not assigned to ${classId}.`, 404);
    }

    return ok(request, {
      message: `Student ${studentId} removed from ${classId}.`,
      studentId,
      classId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return fail(request, 'Unable to remove student from class.', 500, { message });
  }
}
