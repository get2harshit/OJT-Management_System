import type { ApiStudent } from '../types';
import { apiFetch, cachedFetch, invalidateCached } from './client';

// cohortId asks the backend to resolve that cohort's allowedBatches and
// return only students in those batches, instead of the full roster.
export async function apiListStudents(cohortId?: string): Promise<ApiStudent[]> {
  const url = cohortId ? `/api/v1/students?cohortId=${cohortId}` : '/api/v1/students';
  return cachedFetch(`students:list:${cohortId || 'all'}`, 15_000, async () => {
    const res = await apiFetch<{ success: boolean; data: ApiStudent[] }>(url);
    return res.data;
  });
}

// Admin-only. batch must be in "YYYY X" format (e.g. "2025 A"), matching a
// cohort's allowedBatches — the backend rejects anything else.
export async function apiUpdateStudentBatch(studentId: string, batch: string): Promise<ApiStudent> {
  const res = await apiFetch<{ success: boolean; data: ApiStudent }>(`/api/v1/students/${studentId}/batch`, {
    method: 'PATCH',
    body: JSON.stringify({ batch }),
  });
  invalidateCached('students:list');
  return res.data;
}

// Every distinct batch value currently in use across students — used to
// populate the cohort "allowed batches" picker with real values instead of
// a computed guess.
export async function apiListStudentBatches(): Promise<string[]> {
  const res = await apiFetch<{ success: boolean; data: string[] }>('/api/v1/students/batches');
  return res.data;
}
