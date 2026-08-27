// Staff view of the projects teams proposed for themselves.
//
// Separate from projects.ts because it is a separate backend router with
// different rules: only student-authored projects, only ones the mentor has
// approved, and only the fields on SELF_PROPOSED_EDITABLE_FIELDS. Admins see
// a whole OJT; mentors see their own teams. The scoping is decided
// server-side — nothing here narrows anything, so there is no client-side
// filter to get wrong.
import { apiFetch } from './client';

/** The fields an admin or mentor may change. Mirrors the backend whitelist. */
export interface SelfProposedEditableFields {
  title: string;
  description: string;
  problemStatement: string;
  techStack: string[];
  courseCovered: string[];
  coreLearningGoals: string[];
  expectedOutput: string[];
  industry: string;
  mustHaveFeatures: string[];
  goodToHaveFeatures: string[];
  evaluationMetrics: string[];
  endUsersDefined: string | null;
  projectDescription: string | null;
  framework: string[];
  suggestedLibrariesTools: string[];
  stretchGoal: string[];
  firstMonthMilestones: string[];
  secondMonthMilestones: string[];
  thirdMonthMilestones: string[];
  estimatedDuration: number | null;
}

export interface SelfProposedTeamMember {
  id: string;
  fullName: string | null;
}

export interface SelfProposedProject extends SelfProposedEditableFields {
  id: string;
  /** Catalog identifier, e.g. "STU0035". Never editable. */
  projectId: string | null;
  /** Read-only context, shown so a reviewer can see what they may not change. */
  track: string;
  trackName: string;
  theme: string | null;
  referenceDocs: string | null;
  sourceStartupSchool: string | null;
  createdAt: string;
  updatedAt: string;
  team: { id: string; name: string | null; members: SelfProposedTeamMember[] };
  /** Newest entry from the edit history, or null if never edited. */
  lastEdit: { at: string; by: string } | null;
}

export interface SelfProposedCounts {
  byTrack: { slug: string; name: string; count: number }[];
  editableTotal: number;
  // Why the rest of this OJT's self-proposals aren't editable. Split by cause
  // because each one is a different person's move to make: a mentor who
  // hasn't reviewed, a student who owes a resubmission, a disbanded team.
  notEditable: {
    pendingReview: number;
    rejected: number;
    noTeam: number;
    neverSubmitted: number;
  };
}

export interface SelfProposedEdit {
  id: string;
  field: keyof SelfProposedEditableFields;
  oldValue: unknown;
  newValue: unknown;
  changedAt: string;
  changedBy: { id: string; name: string; role: string };
}

export interface SelfProposedPage {
  data: SelfProposedProject[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface ListSelfProposedParams {
  cohortId: string;
  /** Narrows to one team — the mentor's per-team view asks for its own. */
  teamId?: string;
  /** Track slug. A project has exactly one track, so this stays single-value. */
  track?: string;
  search?: string;
  page?: number;
  limit?: number;
}

const BASE = '/api/v1/self-proposed-projects';

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  return search.toString();
}

export async function apiListSelfProposedProjects(
  params: ListSelfProposedParams
): Promise<SelfProposedPage> {
  const res = await apiFetch<{ success: boolean } & SelfProposedPage>(
    `${BASE}?${queryString({ ...params })}`
  );
  return { data: res.data ?? [], pagination: res.pagination };
}

export async function apiGetSelfProposedCounts(cohortId: string): Promise<SelfProposedCounts> {
  const res = await apiFetch<{ success: boolean; data: SelfProposedCounts }>(
    `${BASE}/counts?${queryString({ cohortId })}`
  );
  return res.data;
}

export async function apiGetSelfProposedProject(id: string): Promise<SelfProposedProject> {
  const res = await apiFetch<{ success: boolean; data: SelfProposedProject }>(`${BASE}/${id}`);
  return res.data;
}

/**
 * Sends only the fields being changed. The backend rejects any key outside
 * its whitelist outright, so never spread a whole project object in here —
 * that would include `track` and fail the request.
 */
export async function apiUpdateSelfProposedProject(
  id: string,
  patch: Partial<SelfProposedEditableFields>
): Promise<SelfProposedProject> {
  const res = await apiFetch<{ success: boolean; data: SelfProposedProject }>(`${BASE}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return res.data;
}

export async function apiGetSelfProposedHistory(id: string): Promise<SelfProposedEdit[]> {
  const res = await apiFetch<{ success: boolean; data: SelfProposedEdit[] }>(`${BASE}/${id}/history`);
  return res.data ?? [];
}
