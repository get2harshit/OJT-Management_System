import { apiFetch, cachedFetch, invalidateCached } from './client';

const VISIBLE_MENTORS_TTL = 15_000;

export interface ApiMentorViewGrant {
  id: string;
  granteeId: string;
  granteeName: string | null;
  targetMentorId: string;
  targetMentorName: string | null;
  cohortId: string;
  createdAt: string;
}

export interface ApiVisibleMentor {
  id: string;
  fullName: string | null;
}

// Admin — every active scoped grant for one cohort, grouped by grantee on the client.
export async function apiListMentorViewGrants(cohortId: string): Promise<ApiMentorViewGrant[]> {
  const res = await apiFetch<{ data: ApiMentorViewGrant[] }>(
    `/api/v1/mentor-view-grants?cohortId=${encodeURIComponent(cohortId)}`
  );
  return res.data;
}

// Admin — grants `granteeId` view-only visibility into every id in
// targetMentorIds, for one cohort, in a single call.
export async function apiCreateMentorViewGrants(params: {
  granteeId: string;
  targetMentorIds: string[];
  cohortId: string;
}): Promise<void> {
  await apiFetch('/api/v1/mentor-view-grants', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  invalidateCached('mentor-view-grants');
}

// Admin — soft-revokes one grant.
export async function apiRevokeMentorViewGrant(id: string): Promise<void> {
  await apiFetch(`/api/v1/mentor-view-grants/${id}`, { method: 'DELETE' });
  invalidateCached('mentor-view-grants');
}

// Mentor/external_mentor/batch_manager — every mentor the caller may pick in
// a "View as" switcher for one cohort. admin/batch_manager get every mentor
// in the cohort (blanket access); mentor/external_mentor get only their
// granted targets. The branching happens server-side — this is the one call
// for both cases.
export async function apiListMentorsVisibleToMe(cohortId: string): Promise<ApiVisibleMentor[]> {
  return cachedFetch(`mentor-view-grants:visible:${cohortId}`, VISIBLE_MENTORS_TTL, async () => {
    const res = await apiFetch<{ data: ApiVisibleMentor[] }>(
      `/api/v1/mentors/mine/visible-mentors?cohortId=${encodeURIComponent(cohortId)}`
    );
    return res.data;
  });
}

// Mentor/external_mentor — every cohort the caller has at least one active
// grant in, so "Shared With Me" never offers a cohort with nothing to show.
export async function apiListGrantedCohortIds(): Promise<string[]> {
  const res = await apiFetch<{ data: string[] }>('/api/v1/mentors/mine/granted-cohorts');
  return res.data;
}
