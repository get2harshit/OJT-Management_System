import type { ApiMentor, MentorCapacitySummary } from '../types';
import { apiFetch, cachedFetch, invalidateCached } from './client';

export async function apiListMentors(type?: 'internal' | 'external'): Promise<ApiMentor[]> {
  const url = type ? `/api/v1/mentors?type=${type}` : '/api/v1/mentors';
  return cachedFetch(`mentors:list:${type || 'all'}`, 15_000, () => apiFetch<ApiMentor[]>(url));
}

// Single mentor, for a detail-card view — avoids pulling every mentor just
// to resolve one mentor's own profile fields.
export async function apiGetMentorById(id: string): Promise<ApiMentor> {
  return apiFetch<ApiMentor>(`/api/v1/mentors/${id}`);
}

export interface MentorsPage {
  data: ApiMentor[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface GetMentorsPageParams {
  page: number;
  limit: number;
  search?: string;
  /** Track slug, e.g. "gen_ai". */
  track?: string;
  /** Scope to mentors actually mapped to a specific cohort. */
  cohortId?: string;
}

// Admin — mentor roster, server-paginated with optional search/track/cohort
// filters, for the cohort detail page (mirrors apiListStudentsPage).
export async function apiListMentorsPage(params: GetMentorsPageParams): Promise<MentorsPage> {
  const query = new URLSearchParams();
  query.set('page', String(params.page));
  query.set('limit', String(params.limit));
  if (params.search) query.set('search', params.search);
  if (params.track) query.set('track', params.track);
  if (params.cohortId) query.set('cohortId', params.cohortId);
  return apiFetch<MentorsPage>(`/api/v1/mentors?${query.toString()}`);
}

// Admin or self — updates mutable mentor fields (organization, isExternal, track).
// `track` values must be track slugs (e.g. 'gen_ai').
export async function apiUpdateMentor(
  mentorId: string,
  patch: { organization?: string; isExternal?: boolean; track?: string[] }
): Promise<ApiMentor> {
  const mentor = await apiFetch<ApiMentor>(`/api/v1/mentors/${mentorId}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
  invalidateCached('mentors:list');
  return mentor;
}

export async function apiGetMentorCapacity(mentorId: string, cohortId: string): Promise<MentorCapacitySummary> {
  return apiFetch<MentorCapacitySummary>(`/api/v1/mentors/${mentorId}/capacity?cohortId=${cohortId}`);
}

// Admin-only — sets or clears (pass null) the manual override of a mentor's total capacity.
export async function apiSetMentorCapacityOverride(mentorId: string, overrideTotalCapacity: number | null): Promise<void> {
  await apiFetch<void>(`/api/v1/mentors/${mentorId}/capacity`, {
    method: 'PATCH',
    body: JSON.stringify({ overrideTotalCapacity }),
  });
}
