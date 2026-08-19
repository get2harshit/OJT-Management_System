import type { Cohort, CohortDetails, CreateCohortBody, UpdateCohortBody, Project } from '../types';
import { apiFetch, cachedFetch, invalidateCached } from './client';

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

// includeRoster pulls the cohort's students/mentors/batchManagers arrays too
// — each with a dozen-plus profile fields, expensive, and most callers just
// want the cohort's own metadata (dates, status, allowed batches). Only pass
// it when those roster arrays are actually going to be read.
export async function apiGetCohort(id: string, includeRoster: boolean = false): Promise<CohortDetails> {
  const url = includeRoster ? `/api/v1/cohorts/${id}?includeRoster=true` : `/api/v1/cohorts/${id}`;
  return cachedFetch(`cohorts:get:${id}:${includeRoster}`, COHORTS_TTL, () => apiFetch<CohortDetails>(url));
}

export interface ApiCohortTabCounts {
  students: number;
  mentors: number;
  tracks: number;
  projects: number;
  teams: number;
  allocations: number;
  sessions: number;
  sessionRequests: number;
  payouts: number;
  evaluationConfigs: number;
}

/** Plain per-section counts for the OJT Setup tab badges — no rows, just numbers. */
export async function apiGetCohortTabCounts(id: string): Promise<ApiCohortTabCounts> {
  return apiFetch<ApiCohortTabCounts>(`/api/v1/cohorts/${id}/tab-counts`);
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
      related_field: Array.isArray(p.techStack) ? p.techStack.join(', ') : (p.related_field || ''),
    }));
  });
}

export interface CohortProjectsPage {
  data: Project[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface GetCohortProjectsPageParams {
  page: number;
  limit: number;
  search?: string;
  /** Track slug, e.g. "gen_ai". */
  track?: string;
  /** Catalog id, matched as a prefix — "PST_ADS" narrows to that block. */
  projectId?: string;
}

// Same project list as apiGetProjectsForCohort, but server-paginated with
// optional search/track/project-id filters, for the cohort detail page.
// Every filter is applied by the server: the page only ever holds the rows it
// is showing, so narrowing the list never means fetching the catalog first.
export async function apiGetProjectsForCohortPage(cohortId: string, params: GetCohortProjectsPageParams): Promise<CohortProjectsPage> {
  const query = new URLSearchParams();
  query.set('page', String(params.page));
  query.set('limit', String(params.limit));
  if (params.search) query.set('search', params.search);
  if (params.track) query.set('track', params.track);
  if (params.projectId) query.set('projectId', params.projectId);
  const res = await apiFetch<{ success: boolean; data: RawCohortProject[]; pagination: CohortProjectsPage['pagination'] }>(
    `/api/v1/cohorts/${cohortId}/projects?${query.toString()}`
  );
  return {
    data: res.data.map(p => ({
      ...p,
      related_field: Array.isArray(p.techStack) ? p.techStack.join(', ') : (p.related_field || ''),
    })),
    pagination: res.pagination,
  };
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

// ── Project catalog insights ────────────────────────────────────────────────

export interface CountBucket {
  label: string;
  count: number;
}

export interface CrossTabCell {
  row: string;
  column: string;
  count: number;
}

export interface MentorCoverageRow {
  mentorId: string;
  fullName: string | null;
  projectCount: number;
}

export interface ProjectInsights {
  totals: { projects: number; tracks: number; batches: number; avgDurationWeeks: number | null };
  byTrack: CountBucket[];
  byBatch: CountBucket[];
  byLevel: CountBucket[];
  byDuration: CountBucket[];
  trackByBatch: CrossTabCell[];
  trackByLevel: CrossTabCell[];
  /** How many catalog projects name each mentor — not how many teams they have. */
  mentorCoverage: MentorCoverageRow[];
}

// Counted over the whole catalog on the server. The projects list is
// paginated, so anything totalled from its rows would describe one page.
export async function apiGetProjectInsights(cohortId: string): Promise<ProjectInsights> {
  const res = await apiFetch<{ data: ProjectInsights }>(`/api/v1/cohorts/${cohortId}/projects/insights`);
  return res.data;
}
