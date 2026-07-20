import type { Project, ProjectLevel } from '../types';
import { apiFetch, cachedFetch, invalidateCached } from './client';
import { mapFrontendTrackToBackend, mapBackendTrackToFrontend } from './trackMapping';

const PROJECTS_TTL = 15_000;

export interface ProjectsPage {
  data: Project[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface ListProjectsParams {
  track?: string;
  page?: number;
  limit?: number;
  search?: string;
}

interface RawProject {
  id: string;
  title: string;
  problemStatement?: string;
  track: string;
  techStack?: string[];
  related_field?: string;
}

// The single-project GET (and the create/bulk-create responses) return the
// full record — the trimmed list endpoint only returns RawProject's fields.
interface RawFullProject extends RawProject {
  description?: string;
  endUsersDefined?: string;
  batch?: string[];
  created_at: string;
  end_goals?: string;
  projectBy?: 'PST' | 'STUDENT';
  // Catalog identifier — "PST0001" for admin-imported projects. Renamed
  // from the sheet's "OJTID".
  projectId?: string | null;
  courseCovered?: string[];
  projectDescription?: string;
  framework?: string[];
  suggestedLibrariesTools?: string[];
  coreLearningGoals?: string[];
  stretchGoal?: string[];
  evaluationMetrics?: string[];
  expectedOutput?: string[];
  firstMonthMilestones?: string[];
  secondMonthMilestones?: string[];
  thirdMonthMilestones?: string[];
  industry?: string;
  mustHaveFeatures?: string[];
  goodToHaveFeatures?: string[];
  level?: ProjectLevel;
}

// The trimmed list endpoint doesn't return created_at (only the single-project
// GET does), so this cast reflects the same gap the old `any`-typed mapping
// silently had — not something introduced by this change.
function toFrontendProject(p: RawProject | RawFullProject): Project {
  return {
    ...p,
    track: mapBackendTrackToFrontend(p.track),
    related_field: Array.isArray(p.techStack) ? p.techStack.join(', ') : (p.related_field || ''),
  } as Project;
}

function buildListUrl({ track, page, limit, search }: ListProjectsParams): string {
  const params = new URLSearchParams();
  const apiTrack = track ? mapFrontendTrackToBackend(track) : undefined;
  if (apiTrack) params.set('track', apiTrack);
  if (page) params.set('page', String(page));
  if (limit) params.set('limit', String(limit));
  if (search) params.set('search', search);
  const qs = params.toString();
  return qs ? `/api/v1/projects?${qs}` : '/api/v1/projects';
}

// Returns the trimmed list shape (id/title/problemStatement/track/techStack
// — no description). When called as a student, the backend also silently
// scopes results to that student's own batch codes.
//
// Fetches the whole catalog in one page (backend defaults to 20/page) —
// used by callers that need every project at once (e.g. the Allocations
// dropdown). For a paginated table view, use apiListProjectsPage instead.
//
// Cached: the admin panel shell and the Dashboard tab both call this on
// mount at the same time, so the dedup here collapses that into one
// request instead of two.
export async function apiListProjects(track?: string): Promise<Project[]> {
  const url = buildListUrl({ track, limit: 1000 });
  return cachedFetch(`projects:list:${track || 'all'}`, PROJECTS_TTL, async () => {
    const res = await apiFetch<{ data: RawProject[] }>(url);
    return res.data.map(toFrontendProject);
  });
}

// Server-paginated project list for the admin catalog table.
export async function apiListProjectsPage(params: ListProjectsParams = {}): Promise<ProjectsPage> {
  const url = buildListUrl(params);
  const res = await apiFetch<{ data: RawProject[]; pagination: ProjectsPage['pagination'] }>(url);
  return {
    data: res.data.map(toFrontendProject),
    pagination: res.pagination,
  };
}

// Full project record (description, endUsersDefined, batch, createdAt) —
// only available one at a time, via this endpoint.
export async function apiGetProject(id: string): Promise<Project> {
  const p = await apiFetch<RawFullProject>(`/api/v1/projects/${id}`);
  return toFrontendProject(p);
}

// Manual admin "quick add" form — deliberately lighter than the CSV path:
// only title + track are required on the backend, everything else here is
// optional. The full required set (see ProjectCsvRowInput) only applies to
// bulk/CSV import.
export interface ProjectCreateInput {
  title: string;
  description?: string;
  track: string;
  techStack?: string[];
  problemStatement?: string;
  endUsersDefined?: string;
  batch?: string[];
  courseCovered?: string[];
  projectDescription?: string;
  framework?: string[];
  suggestedLibrariesTools?: string[];
  coreLearningGoals?: string[];
  stretchGoal?: string[];
  evaluationMetrics?: string[];
  expectedOutput?: string[];
  firstMonthMilestones?: string[];
  secondMonthMilestones?: string[];
  thirdMonthMilestones?: string[];
  industry?: string;
  mustHaveFeatures?: string[];
  goodToHaveFeatures?: string[];
  level?: ProjectLevel;
}

// Every field required for the CSV/bulk-import row — matches
// domain/projectFields.ts's adminProjectRowSchema on the backend. project_id
// is supplied by the CSV as-is (e.g. "PST0001") — the backend never
// generates one for this path, only for student self-proposals.
export interface ProjectCsvRowInput extends Required<Omit<ProjectCreateInput, 'level'>> {
  projectId: string;
  level?: ProjectLevel;
}

export async function apiCreateProject(body: ProjectCreateInput): Promise<Project> {
  const payload = {
    ...body,
    track: mapFrontendTrackToBackend(body.track),
  };
  const p = await apiFetch<RawFullProject>('/api/v1/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  invalidateCached('projects:list');
  return toFrontendProject(p);
}

// Partial success: each row is validated and duplicate-checked
// independently on the backend — a bad or duplicate row is reported and
// skipped, it does not fail the rest of the import (this used to be
// all-or-nothing; see ProjectCsvImportModal.tsx for how the result is
// surfaced). A row whose project_id matches an existing catalog project is
// not a duplicate — the backend overwrites that project with the row's
// data and reports it under `updated` instead of `added`.
export interface ProjectBulkImportResult {
  added: Project[];
  updated: Project[];
  duplicates: Array<{ identifier: string; reason: string }>;
  invalid: Array<{ identifier: string; reason: string }>;
  message: string;
}

export async function apiCreateProjectsBulk(items: ProjectCsvRowInput[]): Promise<ProjectBulkImportResult> {
  const payload = {
    projects: items.map(item => ({
      ...item,
      track: mapFrontendTrackToBackend(item.track),
    })),
  };
  const res = await apiFetch<{
    added: RawFullProject[];
    updated: RawFullProject[];
    duplicates: Array<{ identifier: string; reason: string }>;
    invalid: Array<{ identifier: string; reason: string }>;
    message: string;
  }>('/api/v1/projects/bulk', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  invalidateCached('projects:list');
  return {
    added: res.added.map(toFrontendProject),
    updated: res.updated.map(toFrontendProject),
    duplicates: res.duplicates,
    invalid: res.invalid,
    message: res.message,
  };
}

export async function apiDeleteProject(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/projects/${id}`, {
    method: 'DELETE',
  });
  invalidateCached('projects:list');
}

export async function apiDeleteAllProjects(): Promise<{ deletedCount: number }> {
  const result = await apiFetch<{ success: boolean; deletedCount: number }>('/api/v1/projects', {
    method: 'DELETE',
  });
  invalidateCached('projects:list');
  return result;
}
