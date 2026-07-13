import type { TeamAllocationDetail, StudentAllocation } from '../types';
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
