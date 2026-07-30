import { apiFetch, cachedFetch, invalidateCached } from './client';

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

export interface ApiCohortTrackConfig {
  trackId: string;
  trackSlug: string;
  trackName: string;
  eligibilityType: TrackEligibilityType;
  eligibilityValue: string | null;
  projectMode: TrackProjectMode;
  eligibleStudents: ApiEligibleStudent[];
}

export async function apiGetCohortTrackConfig(cohortId: string): Promise<ApiCohortTrackConfig[]> {
  const { data } = await apiFetch<{ data: ApiCohortTrackConfig[] }>(
    `/api/v1/cohorts/${cohortId}/track-config`
  );
  return data;
}

export async function apiSetCohortTrackConfig(
  cohortId: string,
  trackSlug: string,
  eligibilityType: TrackEligibilityType,
  eligibilityValue: string | null | undefined,
  projectMode: TrackProjectMode
): Promise<ApiCohortTrackConfig> {
  const { data } = await apiFetch<{ data: ApiCohortTrackConfig }>(
    `/api/v1/cohorts/${cohortId}/track-config`,
    {
      method: 'PUT',
      body: JSON.stringify({ trackSlug, eligibilityType, eligibilityValue: eligibilityValue ?? null, projectMode }),
    }
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
