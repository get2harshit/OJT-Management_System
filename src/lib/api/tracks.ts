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

// Which variant of a track a request is aimed at. Sent as a query param rather
// than baked into the path so the existing /:trackSlug/... URLs keep working:
// while a track has one variant the server resolves it, and only a track with
// several actually needs to be told.
function variantQuery(configId?: string): string {
  return configId ? `?configId=${encodeURIComponent(configId)}` : '';
}

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

// Admin-facing names for the same four modes the student picker shows, kept
// in the same vocabulary as that screen ("PST recommended" / "self assign") so
// an admin configuring a track and a student reading it are talking about the
// same thing. Display only — the keys are what is stored and validated.
export const SUBMISSION_MODE_LABELS: Record<TrackSubmissionMode, string> = {
  '1_own': 'Self assign project',
  '1_recommended': 'One PST recommended project',
  '2_recommended': 'Two PST recommended projects',
  '1_own_1_recommended': 'Self assign + one PST recommended',
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

// One configured *variant* of a track in this OJT. A track can appear in this
// list more than once — "Product Development, 2024, individual" alongside
// "Product Development, 2025, team" — so `configId`, not `trackSlug`, is what
// identifies a row and what every follow-up write must send back.
export interface ApiCohortTrackConfig {
  configId: string;
  /** Admin-facing name for the variant, e.g. "2024 — Individual". */
  variantLabel: string | null;
  trackId: string;
  trackSlug: string;
  trackName: string;
  eligibilityType: TrackEligibilityType;
  eligibilityValue: string | null;
  projectMode: TrackProjectMode;
  allowedSubmissionModes: TrackSubmissionMode[];
  /** Team ceiling for this track; null means uncapped. */
  maxTeams: number | null;
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
  /**
   * Which variant to write. Send it to edit that one; omit it to add another
   * variant to the same track. Omitting it on a track that already has several
   * is rejected by the server rather than guessed at.
   */
  configId?: string;
  variantLabel?: string | null;
  eligibilityType: TrackEligibilityType;
  eligibilityValue?: string | null;
  /**
   * Omit to let the server derive it from the eligibility — an individual-only
   * admission year gets 'individual', everyone else 'team'. Sending a value
   * always wins.
   */
  projectMode?: TrackProjectMode;
  /**
   * Omit to leave the track's mentors untouched — which is what the config
   * form does, since staffing has its own screen (apiSetTrackMentors).
   * Sending `[]` unassigns everyone, so it must never be sent as a default.
   */
  mentorIds?: string[];
  /** At least one. */
  allowedSubmissionModes: TrackSubmissionMode[];
  /**
   * How many teams this track will take. Null clears any ceiling; every
   * configuration is uncapped until one is set.
   */
  maxTeams?: number | null;
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

export interface CandidateMentorParams {
  search?: string;
  /** Internal staff vs external mentors — the backend's is_external. */
  type?: 'internal' | 'external';
  page?: number;
  limit?: number;
}

export interface CandidateMentorsPage {
  data: ApiCandidateMentor[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

// The OJT's mentors, flagged for this track's picker. Filtering and paging are
// the server's job — the roster runs into the hundreds once an OJT carries its
// external mentors, and slicing that on the client would mean fetching all of
// it to show twenty.
//
// trackSlug is null while the admin is naming a track that doesn't exist yet —
// the roster is identical, only hasExpertise/alreadyAssigned come back false.
export async function apiGetTrackCandidateMentors(
  cohortId: string,
  trackSlug: string | null,
  params: CandidateMentorParams = {},
  configId?: string
): Promise<CandidateMentorsPage> {
  const query = new URLSearchParams();
  if (configId) query.set('configId', configId);
  if (params.search?.trim()) query.set('search', params.search.trim());
  if (params.type) query.set('type', params.type);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  const path = trackSlug
    ? `/api/v1/cohorts/${cohortId}/track-config/${trackSlug}/candidate-mentors`
    : `/api/v1/cohorts/${cohortId}/track-config/candidate-mentors`;
  return apiFetch<CandidateMentorsPage>(`${path}${qs ? `?${qs}` : ''}`);
}

// Ids of everyone the picker's filter matches, for "select all matching" —
// the whole set, none of the rows. Takes the same search/type as the paged
// list, so the selection covers exactly what the table is showing.
//
// No trackSlug: the roster belongs to the OJT, and the track only decides the
// per-mentor flags this does not return.
export async function apiGetCandidateMentorIds(
  cohortId: string,
  params: { search?: string; type?: 'internal' | 'external' } = {}
): Promise<string[]> {
  const query = new URLSearchParams();
  if (params.search?.trim()) query.set('search', params.search.trim());
  if (params.type) query.set('type', params.type);
  const qs = query.toString();
  const { data } = await apiFetch<{ data: string[] }>(
    `/api/v1/cohorts/${cohortId}/track-config/candidate-mentor-ids${qs ? `?${qs}` : ''}`
  );
  return data;
}

/** The mentors currently staffing a track — seeds the picker's ticked state. */
export async function apiGetTrackMentors(
  cohortId: string,
  trackSlug: string,
  configId?: string
): Promise<ApiTrackMentor[]> {
  const { data } = await apiFetch<{ data: ApiTrackMentor[] }>(
    `/api/v1/cohorts/${cohortId}/track-config/${trackSlug}/mentors${variantQuery(configId)}`
  );
  return data;
}

// Replaces the track's mentor set outright, which is what lets the picker
// remove someone as well as add. The caller must send the complete set, not
// just the additions.
export async function apiSetTrackMentors(
  cohortId: string,
  trackSlug: string,
  mentorIds: string[],
  configId?: string
): Promise<ApiTrackMentor[]> {
  const { data } = await apiFetch<{ data: ApiTrackMentor[] }>(
    `/api/v1/cohorts/${cohortId}/track-config/${trackSlug}/mentors${variantQuery(configId)}`,
    { method: 'PUT', body: JSON.stringify({ mentorIds }) }
  );
  return data;
}

export async function apiRemoveCohortTrackConfig(
  cohortId: string,
  trackSlug: string,
  configId?: string
): Promise<void> {
  await apiFetch<void>(
    `/api/v1/cohorts/${cohortId}/track-config/${trackSlug}${variantQuery(configId)}`,
    { method: 'DELETE' }
  );
}

export interface AddEligibleStudentsResult {
  added: number;
  unresolved: string[];
}

export async function apiAddEligibleStudents(
  cohortId: string,
  trackSlug: string,
  input: { registrationNumbers?: string[]; studentIds?: string[] },
  configId?: string
): Promise<AddEligibleStudentsResult> {
  return apiFetch<AddEligibleStudentsResult>(
    `/api/v1/cohorts/${cohortId}/track-config/${trackSlug}/students${variantQuery(configId)}`,
    { method: 'POST', body: JSON.stringify(input) }
  );
}

export async function apiRemoveEligibleStudent(
  cohortId: string,
  trackSlug: string,
  studentId: string,
  configId?: string
): Promise<void> {
  await apiFetch<void>(
    `/api/v1/cohorts/${cohortId}/track-config/${trackSlug}/students/${studentId}${variantQuery(configId)}`,
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
  params: GetCandidateStudentsParams,
  configId?: string
): Promise<CandidateStudentsPage> {
  const query = new URLSearchParams();
  if (configId) query.set('configId', configId);
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
  /** The team ceiling the admin set, or null when the track is uncapped. */
  maxTeams: number | null;
  /** Teams already formed on this track in this OJT. */
  teamCount: number;
  /**
   * Advisory. The server re-checks under a lock when a team is actually formed,
   * because the track can fill between this list rendering and that happening.
   */
  isFull: boolean;
  /** Recommended (PST) projects mapped to this track in this cohort. Zero on a self-proposal-only track — not a warning state. */
  totalProjects: number;
  /** Of those, how many still have room (mapped to this cohort, under 2 teams already holding it). */
  availableProjects: number;
  /**
   * True when none of this track's allowed submission modes can currently be
   * completed — e.g. a catalog-only track with nothing left, or a
   * '2_recommended' track down to its last one. A track that allows
   * self-proposal is never exhausted, regardless of catalog size. Advisory,
   * same as isFull — the server re-checks under the same lock at team
   * creation.
   */
  catalogExhausted: boolean;
}

export async function apiGetAvailableTracks(cohortId: string): Promise<ApiAvailableTrack[]> {
  const { data } = await apiFetch<{ data: ApiAvailableTrack[] }>(
    `/api/v1/cohorts/${cohortId}/available-tracks`
  );
  return data;
}

// ── Configuration proposed from the project catalog ──────────────────────────

export interface ProposalMentor {
  mentorId: string;
  fullName: string | null;
}

// What the catalog says this OJT's configuration should look like, against how
// it is set up now. Read-only until the admin picks from it — the catalog
// carries no project mode or submission options, so it can suggest a
// configuration but never be one.
export type CatalogProposal =
  // Projects exist for an admission year no configuration covers.
  | {
      kind: 'missing_variant';
      trackId: string;
      trackName: string;
      year: string;
      projectCount: number;
      mentorIds: string[];
      mentors: ProposalMentor[];
    }
  // A configuration exists but its mentors differ from the catalog's.
  | {
      kind: 'roster_differs';
      configId: string;
      trackId: string;
      trackName: string;
      variantLabel: string | null;
      years: string[];
      projectCount: number;
      toAdd: string[];
      toRemove: string[];
      mentorsToAdd: ProposalMentor[];
      mentorsToRemove: ProposalMentor[];
    }
  | {
      kind: 'in_sync';
      configId: string;
      trackId: string;
      trackName: string;
      variantLabel: string | null;
      years: string[];
      projectCount: number;
    }
  // A configuration no catalog project speaks to. Reported, never proposed for
  // removal — an empty catalog is usually an un-uploaded sheet.
  | {
      kind: 'no_catalog_projects';
      configId: string;
      trackId: string;
      trackName: string;
      variantLabel: string | null;
      eligibilityType: TrackEligibilityType;
      eligibilityValue: string | null;
    };

export interface CatalogProposalResult {
  proposals: CatalogProposal[];
  catalogProjectCount: number;
}

export async function apiGetCatalogProposal(cohortId: string): Promise<CatalogProposalResult> {
  const res = await apiFetch<{ proposals: CatalogProposal[]; catalogProjectCount: number }>(
    `/api/v1/cohorts/${cohortId}/track-config/catalog-proposal`
  );
  return { proposals: res.proposals, catalogProjectCount: res.catalogProjectCount };
}

// Actions only identify a change; the server recomputes the proposal before
// applying, so a screen left open can't write a roster the catalog no longer
// says.
export type ApplyCatalogAction =
  | { kind: 'create'; trackId: string; year: string }
  | { kind: 'sync_roster'; configId: string };

export interface ApplyCatalogResult {
  created: number;
  rostersUpdated: number;
  /** Changes that were no longer proposed by the time the server recomputed. */
  skipped: string[];
  /** Recommended mentors left out because they are not on this OJT. */
  droppedMentors: string[];
}

export async function apiApplyCatalogProposal(
  cohortId: string,
  actions: ApplyCatalogAction[]
): Promise<ApplyCatalogResult> {
  return apiFetch<ApplyCatalogResult>(
    `/api/v1/cohorts/${cohortId}/track-config/catalog-proposal/apply`,
    { method: 'POST', body: JSON.stringify({ actions }) }
  );
}

// ── Resolving pasted mentor names ────────────────────────────────────────────

export interface ResolvedMentorName {
  mentorId: string;
  fullName: string | null;
  /** The name as it was written in the pasted text. */
  inputName: string;
}

export interface UnresolvedMentorName {
  name: string;
  /** 'ambiguous' means two mentors share that name — picking one would be a guess. */
  reason: 'not_found' | 'ambiguous';
}

export interface ResolveMentorNamesResult {
  matched: ResolvedMentorName[];
  unmatched: UnresolvedMentorName[];
}

// Turns a pasted list of names into mentor ids. Matched server-side: the
// picker only holds one page of the OJT's mentors, so matching in the browser
// would silently miss everyone on a page it hasn't loaded.
//
// Resolves only — it selects nothing. The screen adds the result to its
// selection and the existing Save is still what writes the roster.
export async function apiResolveMentorNames(
  cohortId: string,
  text: string
): Promise<ResolveMentorNamesResult> {
  const res = await apiFetch<{ matched: ResolvedMentorName[]; unmatched: UnresolvedMentorName[] }>(
    `/api/v1/cohorts/${cohortId}/track-config/resolve-mentors`,
    { method: 'POST', body: JSON.stringify({ text }) }
  );
  return { matched: res.matched, unmatched: res.unmatched };
}
