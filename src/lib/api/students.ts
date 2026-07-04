import type { ApiStudent } from '../types';
import { apiFetch } from './client';

// cohortId asks the backend to resolve that cohort's allowedBatches and
// return only students in those batches, instead of the full roster.
export async function apiListStudents(cohortId?: string): Promise<ApiStudent[]> {
  const url = cohortId ? `/api/v1/students?cohortId=${cohortId}` : '/api/v1/students';
  const res = await apiFetch<{ success: boolean; data: ApiStudent[] }>(url);
  return res.data;
}
