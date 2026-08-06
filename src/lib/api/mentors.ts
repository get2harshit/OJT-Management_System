import type { ApiMentor, MentorCapacityListRow, MentorCapacitySummary } from '../types';
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
  /** Internal vs external — maps to ojt_mentors.is_external server-side. */
  type?: 'internal' | 'external';
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
  if (params.type) query.set('type', params.type);
  return apiFetch<MentorsPage>(`/api/v1/mentors?${query.toString()}`);
}

// Ids of every mentor a filter matches — what a picker's "select all matching"
// needs, and nothing else. Asking apiListMentorsPage for everything and reading
// one id off each row shipped every column of every mentor to build a list of
// uuids.
export async function apiListMentorIds(params: {
  search?: string;
  track?: string;
  cohortId?: string;
  type?: 'internal' | 'external';
}): Promise<string[]> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.track) query.set('track', params.track);
  if (params.cohortId) query.set('cohortId', params.cohortId);
  if (params.type) query.set('type', params.type);
  const qs = query.toString();
  // apiFetch returns the response body as-is, so the { success, data } envelope
  // is unwrapped here rather than assumed away.
  const body = await apiFetch<{ data: string[] }>(`/api/v1/mentors/ids${qs ? `?${qs}` : ''}`);
  return body.data;
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

// Admin-only — every mentor matching search/type, with their capacity. Backs
// the Track Configuration → Mentor Capacity bulk-edit table. Unpaginated:
// that table edits whatever it's showing and saves it in one request.
export async function apiListMentorCapacities(params: { search?: string; type?: 'internal' | 'external' }): Promise<MentorCapacityListRow[]> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.type) query.set('type', params.type);
  const qs = query.toString();
  const body = await apiFetch<{ data: MentorCapacityListRow[] }>(`/api/v1/mentors/capacity${qs ? `?${qs}` : ''}`);
  return body.data;
}

// Admin-only — saves capacity for many mentors in one request (pass null per
// mentor to clear their override back to the default).
export async function apiBulkSetMentorCapacity(updates: { mentorId: string; capacityOverride: number | null }[]): Promise<void> {
  await apiFetch<void>('/api/v1/mentors/capacity', {
    method: 'PATCH',
    body: JSON.stringify({ updates }),
  });
}
