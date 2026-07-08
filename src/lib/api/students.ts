import type { ApiStudent } from '../types';
import { apiFetch } from './client';

// cohortId asks the backend to resolve that cohort's allowedBatches and
// return only students in those batches, instead of the full roster.
export async function apiListStudents(cohortId?: string): Promise<ApiStudent[]> {
  const url = cohortId ? `/api/v1/students?cohortId=${cohortId}` : '/api/v1/students';
  const res = await apiFetch<{ success: boolean; data: ApiStudent[] }>(url);
  return res.data;
}

// Admin-only. batch must be in "YYYY-YYYY" format, matching a cohort's
// allowedBatches — the backend rejects anything else.
export async function apiUpdateStudentBatch(studentId: string, batch: string): Promise<ApiStudent> {
  const res = await apiFetch<{ success: boolean; data: ApiStudent }>(`/api/v1/students/${studentId}/batch`, {
    method: 'PATCH',
    body: JSON.stringify({ batch }),
  });
  return res.data;
}
