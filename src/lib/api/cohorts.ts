import type { Cohort, CohortDetails, CreateCohortBody, UpdateCohortBody, Project } from '../types';
import { apiFetch, cachedFetch, invalidateCached } from './client';
import { mapBackendTrackToFrontend } from './trackMapping';

// Cohort sub-pages (students/mentors/projects/teams/allocations tabs) are
// routed as siblings that each fetch the same cohort on mount — this TTL
// means switching between them within 15s reuses one request instead of
// refiring apiGetCohort per tab.
const COHORTS_TTL = 15_000;

export async function apiListCohorts(): Promise<Cohort[]> {
  return cachedFetch('cohorts:list', COHORTS_TTL, () => apiFetch<Cohort[]>('/api/v1/cohorts'));
}

// Any authenticated role — cohorts the current user is a member of (mentors
// can't call apiListCohorts, that's admin-only).
export async function apiListMyCohorts(): Promise<Cohort[]> {
  return cachedFetch('cohorts:mine', COHORTS_TTL, () => apiFetch<Cohort[]>('/api/v1/cohorts/mine'));
}

export async function apiGetCohort(id: string): Promise<CohortDetails> {
  return cachedFetch(`cohorts:get:${id}`, COHORTS_TTL, () => apiFetch<CohortDetails>(`/api/v1/cohorts/${id}`));
}

export async function apiCreateCohort(body: CreateCohortBody): Promise<Cohort> {
  const cohort = await apiFetch<Cohort>('/api/v1/cohorts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  invalidateCached('cohorts:list');
  return cohort;
}

export async function apiUpdateCohort(id: string, body: UpdateCohortBody): Promise<Cohort> {
  const cohort = await apiFetch<Cohort>(`/api/v1/cohorts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  invalidateCached(`cohorts:get:${id}`);
  invalidateCached('cohorts:list');
  return cohort;
}

export async function apiDeleteCohort(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/cohorts/${id}`, {
    method: 'DELETE',
  });
  invalidateCached(`cohorts:get:${id}`);
  invalidateCached('cohorts:list');
}

export async function apiAddProjectsToCohort(cohortId: string, projectIds: string[]): Promise<void> {
  await apiFetch<void>(`/api/v1/cohorts/${cohortId}/projects`, {
    method: 'POST',
    body: JSON.stringify({ projectIds }),
  });
  invalidateCached(`cohorts:get:${cohortId}`);
  invalidateCached(`cohorts:projects:${cohortId}`);
}

type RawCohortProject = Omit<Project, 'track' | 'related_field'> & {
  track: string;
  techStack?: string[];
  related_field?: string;
};

export async function apiGetProjectsForCohort(cohortId: string): Promise<Project[]> {
  return cachedFetch(`cohorts:projects:${cohortId}`, COHORTS_TTL, async () => {
    const res = await apiFetch<RawCohortProject[]>(`/api/v1/cohorts/${cohortId}/projects`);
    return res.map(p => ({
      ...p,
      track: mapBackendTrackToFrontend(p.track),
      related_field: Array.isArray(p.techStack) ? p.techStack.join(', ') : (p.related_field || ''),
    }));
  });
}

// Additive only — there's no unmap endpoint, so callers can only grow a
// cohort's student list, never remove from it via this call.
export async function apiAddStudentsToCohort(cohortId: string, userIds: string[]): Promise<void> {
  await apiFetch<void>(`/api/v1/cohorts/${cohortId}/students`, {
    method: 'POST',
    body: JSON.stringify({ userIds }),
  });
  invalidateCached(`cohorts:get:${cohortId}`);
}

// Additive only — same reasoning as apiAddStudentsToCohort.
export async function apiAddMentorsToCohort(cohortId: string, userIds: string[]): Promise<void> {
  await apiFetch<void>(`/api/v1/cohorts/${cohortId}/mentors`, {
    method: 'POST',
    body: JSON.stringify({ userIds }),
  });
  invalidateCached(`cohorts:get:${cohortId}`);
}
