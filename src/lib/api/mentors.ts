import type { ApiMentor, MentorCapacitySummary } from '../types';
import { apiFetch, cachedFetch, invalidateCached } from './client';

export async function apiListMentors(type?: 'internal' | 'external'): Promise<ApiMentor[]> {
  const url = type ? `/api/v1/mentors?type=${type}` : '/api/v1/mentors';
  return cachedFetch(`mentors:list:${type || 'all'}`, 15_000, () => apiFetch<ApiMentor[]>(url));
}

// Admin or self — updates mutable mentor fields (organization, isExternal, track).
// `track` values must already be backend enum strings (e.g. 'product_development').
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
