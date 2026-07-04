import type { Cohort, CreateCohortBody, UpdateCohortBody, Project } from '../types';
import { apiFetch } from './client';
import { mapBackendTrackToFrontend } from './trackMapping';

export async function apiListCohorts(): Promise<Cohort[]> {
  return apiFetch<Cohort[]>('/api/v1/cohorts');
}

export async function apiGetCohort(id: string): Promise<Cohort> {
  return apiFetch<Cohort>(`/api/v1/cohorts/${id}`);
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

export async function apiGetProjectsForCohort(cohortId: string): Promise<Project[]> {
  const res = await apiFetch<any[]>(`/api/v1/cohorts/${cohortId}/projects`);
  return res.map(p => ({
    ...p,
    track: mapBackendTrackToFrontend(p.track),
    related_field: Array.isArray(p.techStack) ? p.techStack.join(', ') : (p.related_field || ''),
  }));
}
