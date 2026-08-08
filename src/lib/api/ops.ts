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
}

export interface OpsFilterOptions {
  tracks: { id: string; name: string }[];
  batches: string[];
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
  params: { page: number; limit: number; search?: string; trackId?: string }
): Promise<OpsPage<OpsProject>> {
  return apiFetch<OpsPage<OpsProject>>(`/api/v1/cohorts/${cohortId}/ops/projects?${query(params)}`);
}

// The dropdown values, fetched once per OJT. Kept off the list responses so the
// filters stay complete while the table is narrowed to a single page.
export async function apiGetOpsFilterOptions(cohortId: string): Promise<OpsFilterOptions> {
  const res = await apiFetch<{ data: OpsFilterOptions }>(`/api/v1/cohorts/${cohortId}/ops/filters`);
  return res.data;
}
