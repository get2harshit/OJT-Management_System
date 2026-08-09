import type { TeamAllocationDetail, StudentAllocation, MentorLoadSummaryRow, AllocationPreviewEntry, CohortPendingProposal } from '../types';
import { apiFetch, cachedFetch, invalidateCached } from './client';

const ALLOCATION_TTL = 15_000;

// Admin — self-proposed pref1 projects in the cohort still awaiting mentor
// approval (the "under review by mentor" warning list on the allocation page).
export async function apiGetCohortPendingProposals(cohortId: string): Promise<CohortPendingProposal[]> {
  const res = await apiFetch<{ data: CohortPendingProposal[] }>(`/api/v1/teams/cohort/${cohortId}/pending-proposals`);
  return res.data;
}

// Student — the logged-in student's own project allocation, if any.
export async function apiGetMyAllocation(): Promise<StudentAllocation> {
  return cachedFetch('allocation:me', ALLOCATION_TTL, () => apiFetch<StudentAllocation>('/api/v1/allocations/me'));
}

// All authenticated roles — a single allocation by ID (used to resolve which
// student a PRD submission belongs to on the mentor/admin review screens).
// Admin and mentor submission-review pages both look up the same allocation
// IDs independently — cached so the two don't duplicate the round trip.
export async function apiGetAllocation(id: string): Promise<StudentAllocation> {
  return cachedFetch(`allocation:${id}`, ALLOCATION_TTL, () => apiFetch<StudentAllocation>(`/api/v1/allocations/${id}`));
}

export interface TeamsForCohortPage {
  data: TeamAllocationDetail[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface GetTeamsForCohortParams {
  track?: string;
  batch?: string;
  search?: string;
  status?: 'pending' | 'allocated' | 'overridden' | 'published';
  page?: number;
  limit?: number;
  skipCount?: boolean;
  // Scope down to the handful of teams tied to one student/project/mentor —
  // for a detail-card view, instead of paging through the whole cohort.
  studentId?: string;
  projectId?: string;
  mentorId?: string;
  // Attach each member's pending-review submission count — only the
  // submissions review roster needs this badge.
  withPendingReviewCounts?: boolean;
}

// Admin — full per-team preference detail for the allocation review panel,
// server-paginated with optional track/batch/search filters.
export async function apiGetTeamsForCohortDetailed(
  cohortId: string,
  params: GetTeamsForCohortParams = {}
): Promise<TeamsForCohortPage> {
  const query = new URLSearchParams();
  if (params.track) query.set('track', params.track);
  if (params.batch) query.set('batch', params.batch);
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.skipCount) query.set('skipCount', 'true');
  if (params.studentId) query.set('studentId', params.studentId);
  if (params.projectId) query.set('projectId', params.projectId);
  if (params.mentorId) query.set('mentorId', params.mentorId);
  if (params.withPendingReviewCounts) query.set('withPendingReviewCounts', 'true');
  const qs = query.toString();
  return apiFetch<TeamsForCohortPage>(`/api/v1/teams/cohort/${cohortId}/detail${qs ? `?${qs}` : ''}`);
}

// Admin — computes the deferred-acceptance preview across every pending
// team in the cohort. Nothing is persisted — the admin reviews/manually
// reassigns entirely client-side, then commits everything via
// apiDraftAllocation.
export async function apiPreviewAllocation(cohortId: string): Promise<AllocationPreviewEntry[]> {
  const res = await apiFetch<{ data: AllocationPreviewEntry[] }>(`/api/v1/teams/cohort/${cohortId}/allocate`, {
    method: 'POST',
  });
  return res.data;
}

// Admin — commits a previewed (and possibly manually adjusted) batch. Every
// team the preview returned must be present, resolved to a project+mentor —
// the backend re-validates everything (2-teams-per-project cap, track/
// cohort-mapping for any manual pick) before persisting.
export async function apiDraftAllocation(
  cohortId: string,
  finalMapping: { teamId: string; allocatedProjectId: string; mentorId: string }[]
): Promise<void> {
  await apiFetch<void>(`/api/v1/teams/cohort/${cohortId}/draft-allocation`, {
    method: 'POST',
    body: JSON.stringify({ finalMapping }),
  });
  invalidateCached('allocation');
  invalidateCached('cohorts:get');
}

// Admin — manual override, restricted server-side to the team's own two preferences.
export async function apiOverrideTeamAllocation(teamId: string, allocatedProjectId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/teams/${teamId}/allocation`, {
    method: 'PATCH',
    body: JSON.stringify({ allocatedProjectId }),
  });
  invalidateCached('allocation');
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
  invalidateCached('allocation');
}

// Admin — how many teams are currently allocated to each mentor, per track, against their threshold.
export async function apiGetMentorLoadSummary(cohortId: string): Promise<MentorLoadSummaryRow[]> {
  return apiFetch<MentorLoadSummaryRow[]>(`/api/v1/teams/cohort/${cohortId}/mentor-load-summary`);
}

// Admin — how many teams still have something for Run Allocation to do
// (status 'pending' or 'needs_review'). Drives the Run Allocation button:
// a fully-resolved (possibly already-published) cohort shows 0 here until a
// later batch of teams submits fresh preferences.
export async function apiGetRunnableTeamCount(cohortId: string): Promise<number> {
  const res = await apiFetch<{ count: number }>(`/api/v1/teams/cohort/${cohortId}/runnable-count`);
  return res.count;
}

// Admin — bulk-resets every algorithm-allocated team in the cohort back to
// pending (submitted preferences are kept). Manually-overridden teams are
// left untouched. Returns how many teams were reversed.
export async function apiReverseAllocation(cohortId: string): Promise<{ reversedCount: number }> {
  const res = await apiFetch<{ success: boolean; reversedCount: number }>(`/api/v1/teams/cohort/${cohortId}/reverse-allocation`, {
    method: 'POST',
  });
  invalidateCached('allocation');
  return res;
}

// Admin — locks in the cohort's current draft results, making them visible
// to students/mentors. Only allowed once every team has cleared
// needs_review (cohort's allocationRunStatus must be 'draft').
export async function apiPublishAllocation(cohortId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/teams/cohort/${cohortId}/publish-allocation`, { method: 'POST' });
  invalidateCached('allocation');
}

// ── Allocation Blueprint (admin, per-OJT lifecycle overview) ────────────────

export type AllocationBlueprintStage =
  | 'no_team'
  | 'team_no_preferences'
  | 'preferences_pending_allocation'
  | 'allocated_not_published'
  | 'allocated_published';

export type AllocationBlueprintCounts = Record<AllocationBlueprintStage, number>;

// The headline numbers shown beside the page title. Three of the four count
// *teams*, because that is the unit the work happens in — a project is picked
// by a team and an allocation is made to a team. notYetStarted counts students
// on purpose: it's the chase list, and a team that doesn't exist yet can't be
// counted. The labels say which is which so the two can't be read as one.
export interface AllocationBlueprintSummary {
  teamsFormed: number;
  projectsSubmitted: number;
  /** Students with no team and no team request sent — nothing done at all. */
  notYetStarted: number;
  allocationDone: number;
}

export interface AllocationBlueprintOverview {
  stages: AllocationBlueprintCounts;
  summary: AllocationBlueprintSummary;
}

export interface AllocationBlueprintStudent {
  id: string;
  fullName: string | null;
  rollNumber: string | null;
  batch: string | null;
  teamName: string | null;
  // Everyone on the student's team, themselves included. Empty until they join
  // one. Shown together with teamName, which is the group number ("G62").
  teamMembers: { fullName: string | null; batch: string | null }[];
  stage: AllocationBlueprintStage;
  // Only populated once the student's team has submitted preferences —
  // null before that.
  pref1Project: string | null;
  pref2Project: string | null;
  allocatedProject: string | null;
  pref1Mentor: string | null;
  pref2Mentor: string | null;
  allocatedMentor: string | null;
  // The student's team's track — null until a team exists.
  track: string | null;
}

export interface AllocationBlueprintStudentsPage {
  data: AllocationBlueprintStudent[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

// Admin — the page's whole overview in one call: the 5 lifecycle stage counts
// (no team formed yet, through allocated & published) and the headline summary.
// One request rather than two so the header can never briefly disagree with the
// table under it.
export async function apiGetAllocationBlueprint(cohortId: string): Promise<AllocationBlueprintOverview> {
  const res = await apiFetch<{ data: AllocationBlueprintOverview }>(`/api/v1/cohorts/${cohortId}/allocation-blueprint`);
  return res.data;
}

// Admin — paginated student list for this OJT. Every filter is optional: stage
// narrows to one lifecycle stage (drill-down from a summary count), search
// matches name/roll number, batches matches any of the given batches, and
// trackId matches the student's team's track.
//
// Several batches travel as one comma-separated `batch` param, which the server
// splits — batch values never contain a comma, and a single value is still a
// valid one-entry list, so the older single-batch shape stays on the wire.
//
// trackId excludes students without a team, which is what asking for a track
// means: a student who has not joined one has no track to match.
export async function apiGetAllocationBlueprintStudents(
  cohortId: string,
  params: {
    stage?: AllocationBlueprintStage;
    page: number;
    limit: number;
    search?: string;
    batches?: string[];
    trackId?: string;
  }
): Promise<AllocationBlueprintStudentsPage> {
  const query = new URLSearchParams();
  query.set('page', String(params.page));
  query.set('limit', String(params.limit));
  if (params.stage) query.set('stage', params.stage);
  if (params.search) query.set('search', params.search);
  if (params.batches?.length) query.set('batch', params.batches.join(','));
  if (params.trackId) query.set('trackId', params.trackId);
  return apiFetch<AllocationBlueprintStudentsPage>(
    `/api/v1/cohorts/${cohortId}/allocation-blueprint/students?${query.toString()}`
  );
}
