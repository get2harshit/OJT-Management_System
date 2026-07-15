import type { TeamAllocationDetail, StudentAllocation, MentorLoadSummaryRow } from '../types';
import { apiFetch } from './client';

// Student — the logged-in student's own project allocation, if any.
export async function apiGetMyAllocation(): Promise<StudentAllocation> {
  return apiFetch<StudentAllocation>('/api/v1/allocations/me');
}

// All authenticated roles — a single allocation by ID (used to resolve which
// student a PRD submission belongs to on the mentor/admin review screens).
export async function apiGetAllocation(id: string): Promise<StudentAllocation> {
  return apiFetch<StudentAllocation>(`/api/v1/allocations/${id}`);
}

// Admin — full per-team preference detail for the allocation review panel.
export async function apiGetTeamsForCohortDetailed(cohortId: string): Promise<TeamAllocationDetail[]> {
  return apiFetch<TeamAllocationDetail[]>(`/api/v1/teams/cohort/${cohortId}/detail`);
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

// Admin — overrides just the mentor on an already-allocated team. The
// project is untouched, and the mentor doesn't need to match the team's
// track or be one of its submitted preferences.
export async function apiOverrideTeamMentor(teamId: string, mentorId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/teams/${teamId}/allocation/mentor`, {
    method: 'PATCH',
    body: JSON.stringify({ mentorId }),
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
