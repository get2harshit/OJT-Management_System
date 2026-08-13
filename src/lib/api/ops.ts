import { apiFetch } from './client';
import type { TrackSubmissionMode } from '../types';

// ── Allocation Breakdown (ops) ───────────────────────────────────────────────
//
// One OJT read three ways — per team, per mentor, per project. Each view is a
// separate endpoint rather than one payload the client slices: the three share
// no rows, and any of them can run to thousands.

export interface OpsPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface OpsPage<T> {
  data: T[];
  pagination: OpsPagination;
}

/** Where a team is. Coarser than the per-student allocation blueprint stages. */
export type OpsTeamStatus = 'pending' | 'submitted' | 'allocated';

export const OPS_TEAM_STATUS_LABELS: Record<OpsTeamStatus, string> = {
  pending: 'Not submitted',
  submitted: 'Submitted',
  allocated: 'Allocated',
};

export interface OpsTeamMember {
  id: string;
  fullName: string;
  batch: string | null;
}

export interface OpsPreferenceSlot {
  projectId: string;
  projectTitle: string;
  /** Catalog identifier — "PST0001" / "STU0001". Null on pre-import rows. */
  projectCode: string | null;
  isSelfProposed: boolean;
  mentorId: string | null;
  mentorName: string | null;
  mentorIsExternal: boolean;
}

export interface OpsTeam {
  teamId: string;
  teamName: string | null;
  isIndividual: boolean;
  trackId: string;
  trackName: string;
  members: OpsTeamMember[];
  status: OpsTeamStatus;
  /**
   * The raw allocation_status — 'pending' | 'allocated' | 'needs_review'.
   * 'needs_review' is a conflict the allocation run left unsettled; it reads as
   * 'submitted' above, so the table calls it out separately.
   */
  allocationStatus: string | null;
  /** Derived server-side from the saved preferences — null until they submit. */
  submissionMode: TrackSubmissionMode | null;
  preference1: OpsPreferenceSlot | null;
  preference2: OpsPreferenceSlot | null;
  preference1ReviewStatus: string | null;
  /**
   * An admin built this team and named its project outright. Such a team has no
   * submissionMode — it did not submit — so that field is null here for the
   * same reason it is null before anyone submits at all.
   */
  isAdminPlaced: boolean;
  allocatedProjectTitle: string | null;
  allocatedMentorName: string | null;
  submittedAt: string | null;
}

export interface OpsMentor {
  mentorId: string;
  fullName: string;
  email: string;
  isExternal: boolean;
  organization: string | null;
  trackNames: string[];
  preference1Count: number;
  preference2Count: number;
  /** Selections still awaiting allocation — the number capacity is judged on. */
  pendingCount: number;
  allocatedCount: number;
  capacity: number;
  /** False when the admin never set one and the flat default is in use. */
  hasCapacityOverride: boolean;
  remainingCapacity: number;
  isFull: boolean;
  isNearingCapacity: boolean;
}

export interface OpsProject {
  projectId: string;
  projectCode: string | null;
  title: string;
  trackId: string;
  trackName: string;
  isSelfProposed: boolean;
  recommendedMentorNames: string[];
  /** Mentors teams actually paired with it — shown when the catalog names none. */
  chosenMentorNames: string[];
  preference1Count: number;
  preference2Count: number;
  allocatedCount: number;
  /**
   * Distinct teams in this OJT holding it in either preference slot — the
   * number the two-teams-per-project ceiling is about, which the two slot
   * counts above cannot answer between them.
   */
  teamsPickedCount: number;
}

/**
 * Which half of the catalog to list.
 *
 * 'catalog' — imported projects mapped to this OJT. 'proposed' — projects teams
 * wrote for themselves. Omitted means both.
 *
 * The manual-allocation picker asks for 'catalog': a self-proposed project
 * belongs to the team that wrote it, and the create endpoint refuses one.
 */
export type OpsProjectSource = 'catalog' | 'proposed';

export interface OpsFilterOptions {
  tracks: { id: string; name: string }[];
  batches: string[];
}

// ── Overview (analytics) ─────────────────────────────────────────────────────

export interface OpsProgress {
  students: number;
  studentsOnTeam: number;
  /** No team and no request sent — nothing done at all. */
  studentsNotStarted: number;
  teamsFormed: number;
  teamsSubmitted: number;
  /**
   * Students on a team that has submitted. A team of four submitting counts
   * once in teamsSubmitted and four times here, so the two move at different
   * rates — this is the one that says what share of the cohort is through.
   */
  studentsSubmitted: number;
  teamsAllocated: number;
  teamsNeedingReview: number;
  proposalsPendingReview: number;
}

/** Running totals per day, for the progress line. */
export interface OpsTimelinePoint {
  date: string;
  teamsFormed: number;
  teamsSubmitted: number;
  teamsAllocated: number;
}

/** One submission shape a track's teams used, counted in both units. */
export interface OpsTrackSubmissionShape {
  mode: TrackSubmissionMode;
  teams: number;
  students: number;
}

export interface OpsTrackAnalytics {
  trackId: string;
  trackName: string;
  teamsFormed: number;
  teamsSubmitted: number;
  teamsAllocated: number;
  /**
   * What this track's submitted teams actually chose, busiest first. Modes
   * nobody used are absent — what the track *allows* is configuration and
   * lives on the track-config screen.
   */
  submissionShapes: OpsTrackSubmissionShape[];
  /**
   * Teams an admin built and assigned outright, and the students on them.
   *
   * Not one of the shapes: these teams chose nothing. Counted separately so a
   * track whose teams were placed by hand doesn't read as empty — and so the
   * shapes never claim catalog picks nobody made.
   */
  adminPlacedTeams: number;
  adminPlacedStudents: number;
  catalogProjects: number;
  projectsSelected: number;
  mentorsStaffed: number;
  /** Selections this track's own teams made. */
  mentorPicksHere: number;
  /**
   * Selections this track's mentors carry for other tracks. Capacity is one
   * number per mentor for the whole OJT, so a track can find its mentors full
   * from load it never generated.
   */
  mentorPicksElsewhere: number;
  mentorsFull: number;
  mentorsIdle: number;
}

export interface OpsYearAnalytics {
  year: string;
  students: number;
  teamsFormed: number;
  individualTeams: number;
  teamsSubmitted: number;
  byTrack: { trackName: string; teams: number }[];
}

export interface OpsMentorAnalytics {
  mentorId: string;
  fullName: string;
  isExternal: boolean;
  preference1Count: number;
  preference2Count: number;
  pendingCount: number;
  allocatedCount: number;
  capacity: number;
  hasCapacityOverride: boolean;
  isFull: boolean;
  isNearingCapacity: boolean;
  /**
   * Every track this mentor is staffed on, with how often teams there picked
   * them — zero included. Built from the staffing roster, so a mentor assigned
   * four tracks reports four even if only two were ever chosen.
   */
  tracks: { trackId: string; trackName: string; picks: number }[];
}

export interface OpsAnalytics {
  progress: OpsProgress;
  timeline: OpsTimelinePoint[];
  tracks: OpsTrackAnalytics[];
  years: OpsYearAnalytics[];
  mentors: {
    rows: OpsMentorAnalytics[];
    totalCapacity: number;
    totalPending: number;
    fullMentors: number;
    nearingMentors: number;
    /** Staffed, but never picked anywhere. */
    idleMentors: number;
  };
}

// One call for the whole tab: these are read together, and splitting them would
// let the screen show two different moments of the same OJT side by side.
export async function apiGetOpsAnalytics(cohortId: string): Promise<OpsAnalytics> {
  const res = await apiFetch<{ data: OpsAnalytics }>(`/api/v1/cohorts/${cohortId}/ops/analytics`);
  return res.data;
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  return search.toString();
}

export async function apiGetOpsTeams(
  cohortId: string,
  params: { page: number; limit: number; search?: string; batch?: string; trackId?: string; status?: OpsTeamStatus }
): Promise<OpsPage<OpsTeam>> {
  return apiFetch<OpsPage<OpsTeam>>(`/api/v1/cohorts/${cohortId}/ops/teams?${query(params)}`);
}

export async function apiGetOpsMentors(
  cohortId: string,
  params: { page: number; limit: number; search?: string; trackId?: string }
): Promise<OpsPage<OpsMentor>> {
  return apiFetch<OpsPage<OpsMentor>>(`/api/v1/cohorts/${cohortId}/ops/mentors?${query(params)}`);
}

export async function apiGetOpsProjects(
  cohortId: string,
  params: { page: number; limit: number; search?: string; trackId?: string; source?: OpsProjectSource }
): Promise<OpsPage<OpsProject>> {
  return apiFetch<OpsPage<OpsProject>>(`/api/v1/cohorts/${cohortId}/ops/projects?${query(params)}`);
}

// The dropdown values, fetched once per OJT. Kept off the list responses so the
// filters stay complete while the table is narrowed to a single page.
export async function apiGetOpsFilterOptions(cohortId: string): Promise<OpsFilterOptions> {
  const res = await apiFetch<{ data: OpsFilterOptions }>(`/api/v1/cohorts/${cohortId}/ops/filters`);
  return res.data;
}
