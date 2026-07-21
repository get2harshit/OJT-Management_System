import type { TeamAllocationDetail, StudentAllocation, MentorLoadSummaryRow } from '../types';
import { apiFetch } from './client';
import { mapFrontendTrackToBackend } from './trackMapping';

// Student — the logged-in student's own project allocation, if any.
export async function apiGetMyAllocation(): Promise<StudentAllocation> {
  return apiFetch<StudentAllocation>('/api/v1/allocations/me');
}

// All authenticated roles — a single allocation by ID (used to resolve which
// student a PRD submission belongs to on the mentor/admin review screens).
export async function apiGetAllocation(id: string): Promise<StudentAllocation> {
  return apiFetch<StudentAllocation>(`/api/v1/allocations/${id}`);
}

export interface TeamsForCohortPage {
  data: TeamAllocationDetail[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface GetTeamsForCohortParams {
  track?: string;
  batch?: string;
  search?: string;
  status?: 'pending' | 'allocated' | 'overridden';
  page?: number;
  limit?: number;
  skipCount?: boolean;
}

// Admin — full per-team preference detail for the allocation review panel,
// server-paginated with optional track/batch/search filters.
export async function apiGetTeamsForCohortDetailed(
  cohortId: string,
  params: GetTeamsForCohortParams = {}
): Promise<TeamsForCohortPage> {
  const query = new URLSearchParams();
  if (params.track) query.set('track', mapFrontendTrackToBackend(params.track));
  if (params.batch) query.set('batch', params.batch);
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.skipCount) query.set('skipCount', 'true');
  const qs = query.toString();
  return apiFetch<TeamsForCohortPage>(`/api/v1/teams/cohort/${cohortId}/detail${qs ? `?${qs}` : ''}`);
}

// Admin — runs the deferred-acceptance resolution across every pending team in the cohort.
export async function apiRunAllocation(cohortId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/teams/cohort/${cohortId}/allocate`, { method: 'POST' });
}

// Admin — manual override, restricted server-side to the team's own two preferences.
export async function apiOverrideTeamAllocation(teamId: string, allocatedProjectId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/teams/${teamId}/allocation`, {
    method: 'PATCH',
    body: JSON.stringify({ allocatedProjectId }),
  });
}

// Admin — one-step resolution for a team with no allocation yet: the
// project must be one of the team's own two preferences, but the mentor
// can be anyone in the cohort (doesn't need to match the team's track or
// be one of the preferences' mentors).
export async function apiResolveTeamAllocation(teamId: string, allocatedProjectId: string, mentorId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/teams/${teamId}/allocation/resolve`, {
    method: 'PATCH',
    body: JSON.stringify({ allocatedProjectId, mentorId }),
  });
}

// Admin — how many teams are currently allocated to each mentor, per track, against their threshold.
export async function apiGetMentorLoadSummary(cohortId: string): Promise<MentorLoadSummaryRow[]> {
  return apiFetch<MentorLoadSummaryRow[]>(`/api/v1/teams/cohort/${cohortId}/mentor-load-summary`);
}

// Admin — bulk-resets every algorithm-allocated team in the cohort back to
// pending (submitted preferences are kept). Manually-overridden teams are
// left untouched. Returns how many teams were reversed.
export async function apiReverseAllocation(cohortId: string): Promise<{ reversedCount: number }> {
  return apiFetch<{ success: boolean; reversedCount: number }>(`/api/v1/teams/cohort/${cohortId}/reverse-allocation`, {
    method: 'POST',
  });
}

// Admin — locks in the cohort's current draft results, making them visible
// to students/mentors. Only allowed once every team has cleared
// needs_review (cohort's allocationRunStatus must be 'draft').
export async function apiPublishAllocation(cohortId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/teams/cohort/${cohortId}/publish-allocation`, { method: 'POST' });
}
