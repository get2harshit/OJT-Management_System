import type { ApiStudent } from '../types';
import { apiFetch, cachedFetch, invalidateCached } from './client';
import { mapFrontendTrackToBackend } from './trackMapping';

export interface ListStudentsFilters {
  /** Resolves that cohort's allowedBatches and returns only students in those batches. */
  cohortId?: string;
  batch?: string[];
  /** Frontend track label, e.g. "Gen AI" — mapped to the backend enum here. */
  track?: string;
  /** Only students whose own team allocation has actually been published to
   * them — same rule used everywhere else a student's allocation visibility
   * is checked. Use this instead of filtering an unscoped fetch client-side. */
  publishedOnly?: boolean;
}

export async function apiListStudents(filters: ListStudentsFilters = {}): Promise<ApiStudent[]> {
  const query = new URLSearchParams();
  if (filters.cohortId) query.set('cohortId', filters.cohortId);
  if (filters.batch && filters.batch.length > 0) query.set('batch', filters.batch.join(','));
  if (filters.track) query.set('track', mapFrontendTrackToBackend(filters.track));
  if (filters.publishedOnly) query.set('publishedOnly', 'true');
  const queryString = query.toString();
  const url = queryString ? `/api/v1/students?${queryString}` : '/api/v1/students';
  return cachedFetch(`students:list:${queryString || 'all'}`, 15_000, async () => {
    const res = await apiFetch<{ success: boolean; data: ApiStudent[] }>(url);
    return res.data;
  });
}

export interface StudentsPage {
  data: ApiStudent[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface GetStudentsPageParams {
  page: number;
  limit: number;
  batch?: string;
  search?: string;
  /** Scope to a specific cohort's mapped students instead of the whole roster. */
  cohortId?: string;
  /** Frontend track label, e.g. "Gen AI" — mapped to the backend enum here.
   * A student's track comes from their team, not their own profile, so
   * students without a team yet are excluded when this filter is set. */
  track?: string;
}

// Admin — full student roster, server-paginated with optional batch/search
// filters, for the admin Students table (the roster is too big to always
// fetch in one shot). Also used cohort-scoped by the cohort detail page.
export async function apiListStudentsPage(params: GetStudentsPageParams): Promise<StudentsPage> {
  const query = new URLSearchParams();
  query.set('page', String(params.page));
  query.set('limit', String(params.limit));
  if (params.batch) query.set('batch', params.batch);
  if (params.search) query.set('search', params.search);
  if (params.cohortId) query.set('cohortId', params.cohortId);
  if (params.track) query.set('track', mapFrontendTrackToBackend(params.track));
  return apiFetch<StudentsPage>(`/api/v1/students?${query.toString()}`);
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

// Single student, for a detail-card view — avoids pulling the whole roster
// just to resolve one student's own profile fields.
export async function apiGetStudent(id: string): Promise<ApiStudent> {
  const res = await apiFetch<{ success: boolean; data: ApiStudent }>(`/api/v1/students/${id}`);
  return res.data;
}
