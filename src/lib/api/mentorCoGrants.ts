import { apiFetch } from './client';

export interface ApiMentorCoGrant {
  id: string;
  coMentorId: string;
  coMentorName: string | null;
  primaryMentorId: string;
  primaryMentorName: string | null;
  cohortId: string;
  createdAt: string;
}

// Admin — every active full write-parity co-mentor grant for one cohort.
// NOT the same thing as /mentor-view-grants (mentorViewGrants.ts) — that one
// is read-only, this one lets the co-mentor act (approve tasks, review
// submissions, mark attendance, host sessions) exactly like the primary can.
export async function apiListMentorCoGrants(cohortId: string): Promise<ApiMentorCoGrant[]> {
  const res = await apiFetch<{ data: ApiMentorCoGrant[] }>(
    `/api/v1/mentor-co-grants?cohortId=${encodeURIComponent(cohortId)}`
  );
  return res.data;
}

// Admin — grants `coMentorId` full read+write parity over every id in
// primaryMentorIds, for one cohort, in a single call.
export async function apiCreateMentorCoGrants(params: {
  coMentorId: string;
  primaryMentorIds: string[];
  cohortId: string;
}): Promise<void> {
  await apiFetch('/api/v1/mentor-co-grants', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** One entry in the mentor panel's "acting as" switcher. */
export interface ApiActableMentor {
  mentorId: string;
  mentorName: string | null;
  cohortId: string;
  cohortName: string | null;
}

// The mentors the signed-in user may act as, one row per (mentor, OJT) pair
// since a co-mentor grant is always scoped to one OJT. Any mentor can call
// this for themselves — it returns their own grants only.
export async function apiListActableMentors(): Promise<ApiActableMentor[]> {
  const res = await apiFetch<{ data: ApiActableMentor[] }>('/api/v1/mentor-co-grants/mine/actable-mentors');
  return res.data;
}

// Admin — soft-revokes one co-mentor grant.
export async function apiRevokeMentorCoGrant(id: string): Promise<void> {
  await apiFetch(`/api/v1/mentor-co-grants/${id}`, { method: 'DELETE' });
}
