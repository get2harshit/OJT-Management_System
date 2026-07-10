import type { TeamAllocationDetail } from '../types';
import { apiFetch } from './client';

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
