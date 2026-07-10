import type { ApiMentor, MentorCapacitySummary, MentorTrackRatio } from '../types';
import { apiFetch } from './client';

export async function apiListMentors(type?: 'internal' | 'external'): Promise<ApiMentor[]> {
  const url = type ? `/api/v1/mentors?type=${type}` : '/api/v1/mentors';
  return apiFetch<ApiMentor[]>(url);
}

// Admin or self — updates mutable mentor fields (organization, isExternal, track).
// `track` values must already be backend enum strings (e.g. 'product_development').
export async function apiUpdateMentor(
  mentorId: string,
  patch: { organization?: string; isExternal?: boolean; track?: string[] }
): Promise<ApiMentor> {
  return apiFetch<ApiMentor>(`/api/v1/mentors/${mentorId}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
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

export async function apiGetMentorTrackRatios(mentorId: string): Promise<MentorTrackRatio[]> {
  return apiFetch<MentorTrackRatio[]>(`/api/v1/mentors/${mentorId}/track-ratios`);
}

// Mentor self-service — replace-all semantics, ratios must sum to 100.
export async function apiSetMentorTrackRatios(mentorId: string, ratios: MentorTrackRatio[]): Promise<void> {
  await apiFetch<void>(`/api/v1/mentors/${mentorId}/track-ratios`, {
    method: 'PUT',
    body: JSON.stringify({ ratios }),
  });
}
