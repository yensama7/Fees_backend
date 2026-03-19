'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assignStudentToClass, removeStudentFromClass, upsertClassFee } from '@/lib/db';
import { getAdminSessionFromCookies } from '@/lib/auth';

async function requireAdminSession() {
  const session = await getAdminSessionFromCookies();
  if (!session) {
    redirect('/admin/login');
  }

  return session;
}

export async function updateClassFeeAction(formData: FormData) {
  await requireAdminSession();

  const classId = String(formData.get('classId') ?? '').trim().toUpperCase();
  const feeAmount = Number(formData.get('feeAmount') ?? 0);

  if (!classId || !Number.isFinite(feeAmount) || feeAmount < 0) {
    redirect('/admin?status=Invalid%20class%20fee%20submission');
  }

  await upsertClassFee(classId, feeAmount);
  revalidatePath('/admin');
  redirect(`/admin?status=Saved%20fee%20for%20${encodeURIComponent(classId)}`);
}

export async function assignStudentAction(formData: FormData) {
  await requireAdminSession();

  const classId = String(formData.get('classId') ?? '').trim().toUpperCase();
  const studentId = String(formData.get('studentId') ?? '').trim().toUpperCase();
  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();

  if (!classId || !studentId) {
    redirect('/admin?status=Student%20ID%20and%20class%20are%20required');
  }

  await assignStudentToClass({ classId, studentId, firstName, lastName });
  revalidatePath('/admin');
  redirect(`/admin?status=Assigned%20${encodeURIComponent(studentId)}%20to%20${encodeURIComponent(classId)}`);
}

export async function removeStudentAction(formData: FormData) {
  await requireAdminSession();

  const classId = String(formData.get('classId') ?? '').trim().toUpperCase();
  const studentId = String(formData.get('studentId') ?? '').trim().toUpperCase();

  if (!classId || !studentId) {
    redirect('/admin?status=Student%20ID%20and%20class%20are%20required');
  }

  await removeStudentFromClass(classId, studentId);
  revalidatePath('/admin');
  redirect(`/admin?status=Removed%20${encodeURIComponent(studentId)}%20from%20${encodeURIComponent(classId)}`);
}
