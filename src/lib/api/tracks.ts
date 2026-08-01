import { apiFetch, cachedFetch, invalidateCached } from './client';
import type { TrackSubmissionMode } from '../types';

// Tracks are admin-managed rows now (not a fixed list) — identified across
// the API by their slug (e.g. "open_source"), same string the old backend
// enum used. `name` is the display label.
export interface ApiTrack {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

const TRACKS_TTL = 30_000;

export async function apiListTracks(includeInactive = false): Promise<ApiTrack[]> {
  const url = includeInactive ? '/api/v1/tracks?includeInactive=true' : '/api/v1/tracks';
  const key = `tracks:list:${includeInactive}`;
  const { data } = await cachedFetch(key, TRACKS_TTL, () => apiFetch<{ data: ApiTrack[] }>(url));
  return data;
}

export async function apiCreateTrack(name: string): Promise<ApiTrack> {
  const { data } = await apiFetch<{ data: ApiTrack }>('/api/v1/tracks', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  invalidateCached('tracks:list');
  return data;
}

export async function apiRenameTrack(id: string, name: string): Promise<ApiTrack> {
  const { data } = await apiFetch<{ data: ApiTrack }>(`/api/v1/tracks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
  invalidateCached('tracks:list');
  return data;
}

export async function apiDeactivateTrack(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/tracks/${id}`, { method: 'DELETE' });
  invalidateCached('tracks:list');
}

// ── Per-OJT track configuration ──────────────────────────────────────────────

export type TrackEligibilityType = 'year' | 'batch' | 'unique';
export type TrackProjectMode = 'individual' | 'team';

export interface ApiEligibleStudent {
  studentId: string;
  fullName: string | null;
  rollNumber: string | null;
  registrationNumber: string | null;
  batch: string | null;
}

// Defined alongside MyTeamStatus, which also carries it — re-exported so
// track-config callers don't need to reach into the types module.
export type { TrackSubmissionMode } from '../types';

export const SUBMISSION_MODE_LABELS: Record<TrackSubmissionMode, string> = {
  '1_own': 'Their own project',
  '1_recommended': 'One recommended project',
  '2_recommended': 'Two recommended projects',
  '1_own_1_recommended': 'Their own project + one recommended',
};

// A mentor staffing this track in this OJT.
export interface ApiTrackMentor {
  mentorId: string;
  fullName: string | null;
  email: string | null;
  organization: string | null;
  isExternal: boolean;
}

// One row of the track-config mentor picker.
export interface ApiCandidateMentor extends ApiTrackMentor {
  alreadyAssigned: boolean;
  /** Their declared expertise covers this track — used to pre-tick the picker. */
  hasExpertise: boolean;
}

export interface ApiCohortTrackConfig {
  trackId: string;
  trackSlug: string;
  trackName: string;
  eligibilityType: TrackEligibilityType;
  eligibilityValue: string | null;
  projectMode: TrackProjectMode;
  allowedSubmissionModes: TrackSubmissionMode[];
  mentors: ApiTrackMentor[];
  eligibleStudents: ApiEligibleStudent[];
}

export async function apiGetCohortTrackConfig(cohortId: string): Promise<ApiCohortTrackConfig[]> {
  const { data } = await apiFetch<{ data: ApiCohortTrackConfig[] }>(
    `/api/v1/cohorts/${cohortId}/track-config`
  );
  return data;
}

export interface SetCohortTrackConfigInput {
  trackSlug: string;
  eligibilityType: TrackEligibilityType;
  eligibilityValue?: string | null;
  projectMode: TrackProjectMode;
  /** At least one — the backend refuses to save a track nobody mentors. */
  mentorIds: string[];
  /** At least one. */
  allowedSubmissionModes: TrackSubmissionMode[];
}

export async function apiSetCohortTrackConfig(
  cohortId: string,
  input: SetCohortTrackConfigInput
): Promise<ApiCohortTrackConfig> {
  const { data } = await apiFetch<{ data: ApiCohortTrackConfig }>(
    `/api/v1/cohorts/${cohortId}/track-config`,
    {
      method: 'PUT',
      body: JSON.stringify({ ...input, eligibilityValue: input.eligibilityValue ?? null }),
    }
  );
  return data;
}

// The OJT's mentors, flagged for this track's picker. Returned whole — the
// roster is small and the multi-select needs all of it at once.
export async function apiGetTrackCandidateMentors(
  cohortId: string,
  trackSlug: string,
  search?: string
): Promise<ApiCandidateMentor[]> {
  const query = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
  const { data } = await apiFetch<{ data: ApiCandidateMentor[] }>(
    `/api/v1/cohorts/${cohortId}/track-config/${trackSlug}/candidate-mentors${query}`
  );
  return data;
}

export async function apiRemoveCohortTrackConfig(cohortId: string, trackSlug: string): Promise<void> {
  await apiFetch<void>(`/api/v1/cohorts/${cohortId}/track-config/${trackSlug}`, { method: 'DELETE' });
}

export interface AddEligibleStudentsResult {
  added: number;
  unresolved: string[];
}

export async function apiAddEligibleStudents(
  cohortId: string,
  trackSlug: string,
  input: { registrationNumbers?: string[]; studentIds?: string[] }
): Promise<AddEligibleStudentsResult> {
  return apiFetch<AddEligibleStudentsResult>(
    `/api/v1/cohorts/${cohortId}/track-config/${trackSlug}/students`,
    { method: 'POST', body: JSON.stringify(input) }
  );
}

export async function apiRemoveEligibleStudent(cohortId: string, trackSlug: string, studentId: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/cohorts/${cohortId}/track-config/${trackSlug}/students/${studentId}`,
    { method: 'DELETE' }
  );
}

// ── Unique-track candidate picker (with academic performance) ────────────────

export interface ApiCandidateStudent {
  studentId: string;
  fullName: string | null;
  rollNumber: string | null;
  registrationNumber: string | null;
  batch: string | null;
  email: string | null;
  currentTier: string | null;
  /** Imported academic performance %, or null if this student has no row. */
  performancePercentage: number | null;
  /** Already on this track's eligible list — shown as added, not re-selectable. */
  alreadyEligible: boolean;
}

export interface CandidateStudentsPage {
  data: ApiCandidateStudent[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface GetCandidateStudentsParams {
  page: number;
  limit: number;
  search?: string;
  batch?: string;
  /** Only students with performance >= this (0-100); students without a score drop out. */
  minPerformance?: number;
}

// Cohort students + their academic performance for a unique track's picker
// page — server-filtered/paginated (best performer first).
export async function apiGetTrackCandidateStudents(
  cohortId: string,
  trackSlug: string,
  params: GetCandidateStudentsParams
): Promise<CandidateStudentsPage> {
  const query = new URLSearchParams();
  query.set('page', String(params.page));
  query.set('limit', String(params.limit));
  if (params.search) query.set('search', params.search);
  if (params.batch) query.set('batch', params.batch);
  if (params.minPerformance !== undefined) query.set('minPerformance', String(params.minPerformance));
  const res = await apiFetch<{ data: ApiCandidateStudent[]; pagination: CandidateStudentsPage['pagination'] }>(
    `/api/v1/cohorts/${cohortId}/track-config/${trackSlug}/candidate-students?${query.toString()}`
  );
  return { data: res.data, pagination: res.pagination };
}

// ── Student-facing ────────────────────────────────────────────────────────────

export interface ApiAvailableTrack {
  trackSlug: string;
  trackName: string;
  eligibilityType: TrackEligibilityType;
  projectMode: TrackProjectMode;
  /** True for a restricted (unique) track the student was specifically named for. */
  opportunityEarned: boolean;
}

export async function apiGetAvailableTracks(cohortId: string): Promise<ApiAvailableTrack[]> {
  const { data } = await apiFetch<{ data: ApiAvailableTrack[] }>(
    `/api/v1/cohorts/${cohortId}/available-tracks`
  );
  return data;
}
