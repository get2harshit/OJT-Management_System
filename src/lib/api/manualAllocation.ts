import { apiFetch } from './client';
import { invalidateTeamCaches } from './teams';

/**
 * The admin's manual-allocation page.
 *
 * The page fills one row at a time — student, teammate, track, project, mentor
 * — and each of these answers "what may go in the next cell" given the cells
 * already filled. None of them is a list to be narrowed in the browser: the
 * rules that narrow it (individual mandates, per-variant track eligibility, fee
 * status) are enforced server-side on submit, and a second copy of them here
 * would be a second rulebook to keep in step with that one.
 */

export interface ManualAllocationPage<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface PlaceableStudent {
  id: string;
  fullName: string | null;
  rollNumber: string | null;
  batch: string | null;
  /** Leading four digits of the batch — what track variants are keyed on. */
  admissionYear: string | null;
  /**
   * Must do an individual project, so this row has no teammate to pick. Per
   * student, not per year: an admin override grants it to a single 2025 student
   * too, and the table honours that row by row.
   */
  isIndividualMandated: boolean;
}

export interface SelectableTrack {
  trackId: string;
  trackSlug: string;
  trackName: string;
  projectMode: 'individual' | 'team';
  maxTeams: number | null;
  teamCount: number;
  /**
   * At or over the ceiling. Shown, never used to hide the track — placing a
   * team on a full track is a decision an admin is allowed to make.
   */
  isFull: boolean;
  totalProjects: number;
  availableProjects: number;
  totalMentors: number;
  availableMentors: number;
}

/** Straight from the shared mentor picker — snake_case but for the two flags. */
interface RawManualAllocationMentor {
  id: string;
  full_name: string;
  email?: string | null;
  organization?: string | null;
  is_external: boolean;
  isFull: boolean;
  isNearingCapacity: boolean;
}

export interface ManualAllocationMentor {
  id: string;
  fullName: string;
  email: string | null;
  organization: string | null;
  isExternal: boolean;
  /** At soft capacity. Shown as a warning here rather than as a block. */
  isFull: boolean;
  isNearingCapacity: boolean;
}

export interface ManualTeamDraftRow {
  rowId: string;
  studentIds: string[];
  track: string;
  projectId: string;
  mentorId: string;
}

export interface ManualTeamBulkResult {
  created: Array<{ rowId: string; teamId: string; teamName: string | null; studentIds: string[] }>;
  failed: Array<{ rowId: string; reason: string }>;
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  return search.toString();
}

/** The years this OJT has students from — the table's only filter. */
export async function apiGetManualAllocationYears(cohortId: string): Promise<string[]> {
  const res = await apiFetch<{ data: string[] }>(`/api/v1/cohorts/${cohortId}/manual-allocation/years`);
  return res.data;
}

/** The table: students on this OJT who never ended up on a team. */
export async function apiGetPlaceableStudents(
  cohortId: string,
  params: { year?: string; search?: string; page: number; limit: number }
): Promise<ManualAllocationPage<PlaceableStudent>> {
  return apiFetch<ManualAllocationPage<PlaceableStudent>>(
    `/api/v1/cohorts/${cohortId}/manual-allocation/students?${query(params)}`
  );
}

/** Who one student may be paired with — same year, both sides pairable. */
export async function apiGetTeammateCandidates(
  cohortId: string,
  studentId: string,
  params: { search?: string; page: number; limit: number }
): Promise<ManualAllocationPage<PlaceableStudent>> {
  return apiFetch<ManualAllocationPage<PlaceableStudent>>(
    `/api/v1/cohorts/${cohortId}/manual-allocation/teammates?${query({ studentId, ...params })}`
  );
}

/**
 * The tracks this exact selection may be placed on.
 *
 * Takes the selection rather than a year because that is what decides it: a
 * track in individual mode is offered to one student and withdrawn the moment a
 * second is added.
 */
export async function apiGetSelectableTracks(cohortId: string, studentIds: string[]): Promise<SelectableTrack[]> {
  const res = await apiFetch<{ data: SelectableTrack[] }>(
    `/api/v1/cohorts/${cohortId}/manual-allocation/tracks?${query({ studentIds: studentIds.join(',') })}`
  );
  return res.data;
}

/**
 * The mentors staffing the track variant this selection resolves to.
 *
 * The variant is worked out server-side from the selection — it is the one the
 * write will stamp on the team, so there is nothing for the page to pass and
 * nothing for it to get wrong.
 */
export async function apiGetManualAllocationMentors(
  cohortId: string,
  track: string,
  studentIds: string[]
): Promise<ManualAllocationMentor[]> {
  const res = await apiFetch<{ data: RawManualAllocationMentor[] }>(
    `/api/v1/cohorts/${cohortId}/manual-allocation/mentors?${query({ track, studentIds: studentIds.join(',') })}`
  );
  return res.data.map((mentor) => ({
    id: mentor.id,
    fullName: mentor.full_name,
    email: mentor.email ?? null,
    organization: mentor.organization ?? null,
    isExternal: mentor.is_external,
    isFull: mentor.isFull,
    isNearingCapacity: mentor.isNearingCapacity,
  }));
}

/**
 * Creates every drafted row, reporting each row's fate separately.
 *
 * Partial success: rows that landed come back in `created`, the rest in
 * `failed` with a reason written to be shown beside the row. A batch where
 * nothing succeeded is still a normal response — the reasons are the answer.
 */
export async function apiCreateManualTeams(
  cohortId: string,
  teams: ManualTeamDraftRow[]
): Promise<ManualTeamBulkResult> {
  const res = await apiFetch<{ data: ManualTeamBulkResult }>(
    `/api/v1/cohorts/${cohortId}/manual-allocation/teams`,
    { method: 'POST', body: JSON.stringify({ teams }) }
  );
  invalidateTeamCaches();
  return res.data;
}
