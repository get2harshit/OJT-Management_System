import type { Cohort, CohortDetails, CreateCohortBody, UpdateCohortBody, Project } from '../types';
import { apiFetch } from './client';
import { mapBackendTrackToFrontend } from './trackMapping';

export async function apiListCohorts(): Promise<Cohort[]> {
  return apiFetch<Cohort[]>('/api/v1/cohorts');
}

// Any authenticated role — cohorts the current user is a member of (mentors
// can't call apiListCohorts, that's admin-only).
export async function apiListMyCohorts(): Promise<Cohort[]> {
  return apiFetch<Cohort[]>('/api/v1/cohorts/mine');
}

export async function apiGetCohort(id: string): Promise<CohortDetails> {
  return apiFetch<CohortDetails>(`/api/v1/cohorts/${id}`);
}

export async function apiCreateCohort(body: CreateCohortBody): Promise<Cohort> {
  return apiFetch<Cohort>('/api/v1/cohorts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function apiUpdateCohort(id: string, body: UpdateCohortBody): Promise<Cohort> {
  return apiFetch<Cohort>(`/api/v1/cohorts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function apiDeleteCohort(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/cohorts/${id}`, {
    method: 'DELETE',
  });
}

export async function apiAddProjectsToCohort(cohortId: string, projectIds: string[]): Promise<void> {
  return apiFetch<void>(`/api/v1/cohorts/${cohortId}/projects`, {
    method: 'POST',
    body: JSON.stringify({ projectIds }),
  });
}

type RawCohortProject = Omit<Project, 'track' | 'related_field'> & {
  track: string;
  techStack?: string[];
  related_field?: string;
};

export async function apiGetProjectsForCohort(cohortId: string): Promise<Project[]> {
  const res = await apiFetch<RawCohortProject[]>(`/api/v1/cohorts/${cohortId}/projects`);
  return res.map(p => ({
    ...p,
    track: mapBackendTrackToFrontend(p.track),
    related_field: Array.isArray(p.techStack) ? p.techStack.join(', ') : (p.related_field || ''),
  }));
}

// Additive only — there's no unmap endpoint, so callers can only grow a
// cohort's student list, never remove from it via this call.
export async function apiAddStudentsToCohort(cohortId: string, userIds: string[]): Promise<void> {
  return apiFetch<void>(`/api/v1/cohorts/${cohortId}/students`, {
    method: 'POST',
    body: JSON.stringify({ userIds }),
  });
}

// Additive only — same reasoning as apiAddStudentsToCohort.
export async function apiAddMentorsToCohort(cohortId: string, userIds: string[]): Promise<void> {
  return apiFetch<void>(`/api/v1/cohorts/${cohortId}/mentors`, {
    method: 'POST',
    body: JSON.stringify({ userIds }),
  });
}
