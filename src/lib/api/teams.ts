import type {
  MyCohort,
  MyTeamStatus,
  Team,
  AdminTeam,
  PendingSentRequest,
  PendingReceivedRequest,
  TeamProjectPreferences,
  AvailableTeammate,
  TeamProject,
  SemesterSession,
} from '../types';
import { apiFetch } from './client';
import { mapFrontendTrackToBackend, mapBackendTrackToFrontend } from './trackMapping';

// ── Raw backend wire shapes (pre-mapping) ───────────────────────────────────────

interface RawTeamMember {
  studentId: string;
  fullName?: string | null;
}

interface RawTeam {
  id: string;
  track: string;
  isIndividual: boolean;
  members?: RawTeamMember[];
}

interface RawAdminTeam extends RawTeam {
  createdAt: string;
  hasSubmittedProjectPreferences?: boolean;
}

interface RawSentRequest {
  id: string;
  receiverId: string;
  receiverName?: string | null;
  track: string;
  expiresAt: string;
}

interface RawReceivedRequest {
  id: string;
  senderId: string;
  senderName?: string | null;
  track: string;
  expiresAt: string;
}

interface RawPreferences {
  id: string;
  teamId: string;
  preference1Id: string;
  preference2Id: string;
  allocatedProjectId?: string | null;
  submittedAt: string;
}

interface RawProject {
  id: string;
  title: string;
  description?: string;
  track: string;
  tech_stack?: string[];
  techStack?: string[];
  problem_statement?: string;
  problemStatement?: string;
  end_users_defined?: string;
  endUsersDefined?: string;
  project_by?: 'PST' | 'STUDENT';
  projectBy?: 'PST' | 'STUDENT';
  created_by_team_id?: string | null;
  createdByTeamId?: string | null;
}

interface RawMyCohort {
  cohortId: string;
  name?: string | null;
  sessionTerm: SemesterSession;
  allowedBatches?: string[];
}

interface RawMyTeamStatus {
  team: RawTeam | null;
  pendingSentRequest: RawSentRequest | null;
  pendingReceivedRequest: RawReceivedRequest | null;
  projectPreferences: RawPreferences | null;
}

interface RawAvailableTeammate {
  id: string;
  roll_number: string;
  batch: string;
  full_name: string;
}

function mapTeam(t: RawTeam): Team {
  return {
    id: t.id,
    track: mapBackendTrackToFrontend(t.track),
    isIndividual: t.isIndividual,
    members: (t.members || []).map((m) => ({
      studentId: m.studentId,
      fullName: m.fullName ?? null,
    })),
  };
}

function mapAdminTeam(t: RawAdminTeam): AdminTeam {
  return {
    ...mapTeam(t),
    createdAt: t.createdAt,
    hasSubmittedProjectPreferences: !!t.hasSubmittedProjectPreferences,
  };
}

function mapSentRequest(r: RawSentRequest): PendingSentRequest {
  return {
    id: r.id,
    receiverId: r.receiverId,
    receiverName: r.receiverName ?? null,
    track: mapBackendTrackToFrontend(r.track),
    expiresAt: r.expiresAt,
  };
}

function mapReceivedRequest(r: RawReceivedRequest): PendingReceivedRequest {
  return {
    id: r.id,
    senderId: r.senderId,
    senderName: r.senderName ?? null,
    track: mapBackendTrackToFrontend(r.track),
    expiresAt: r.expiresAt,
  };
}

function mapPreferences(p: RawPreferences): TeamProjectPreferences {
  return {
    id: p.id,
    teamId: p.teamId,
    preference1Id: p.preference1Id,
    preference2Id: p.preference2Id,
    allocatedProjectId: p.allocatedProjectId ?? null,
    submittedAt: p.submittedAt,
  };
}

function mapProject(p: RawProject): TeamProject {
  return {
    id: p.id,
    title: p.title,
    description: p.description ?? undefined,
    track: mapBackendTrackToFrontend(p.track),
    techStack: p.tech_stack ?? p.techStack ?? [],
    problemStatement: p.problem_statement ?? p.problemStatement ?? undefined,
    endUsersDefined: p.end_users_defined ?? p.endUsersDefined ?? undefined,
    // Backend always sends one of the two casings; required on the frontend type.
    projectBy: (p.project_by ?? p.projectBy)!,
    createdByTeamId: p.created_by_team_id ?? p.createdByTeamId ?? null,
  };
}

export async function apiGetMyCohort(): Promise<MyCohort> {
  const res = await apiFetch<RawMyCohort>('/api/v1/teams/my-cohort');
  return {
    cohortId: res.cohortId,
    name: res.name ?? null,
    sessionTerm: res.sessionTerm,
    allowedBatches: res.allowedBatches ?? [],
  };
}

export async function apiGetMyTeamStatus(cohortId: string): Promise<MyTeamStatus> {
  const res = await apiFetch<RawMyTeamStatus>(`/api/v1/teams/my-status?cohortId=${cohortId}`);
  return {
    team: res.team ? mapTeam(res.team) : null,
    pendingSentRequest: res.pendingSentRequest ? mapSentRequest(res.pendingSentRequest) : null,
    pendingReceivedRequest: res.pendingReceivedRequest ? mapReceivedRequest(res.pendingReceivedRequest) : null,
    projectPreferences: res.projectPreferences ? mapPreferences(res.projectPreferences) : null,
  };
}

export async function apiGetAvailableTeammates(cohortId: string): Promise<AvailableTeammate[]> {
  const res = await apiFetch<RawAvailableTeammate[]>(`/api/v1/teams/available-teammates?cohortId=${cohortId}`);
  return res.map(s => ({
    studentId: s.id,
    rollNumber: s.roll_number,
    batch: s.batch,
    fullName: s.full_name,
  }));
}

export async function apiSendTeamRequest(receiverId: string, cohortId: string, track: string): Promise<void> {
  await apiFetch<void>('/api/v1/teams/request', {
    method: 'POST',
    body: JSON.stringify({ receiverId, cohortId, track: mapFrontendTrackToBackend(track) }),
  });
}

export async function apiRespondToTeamRequest(requestId: string, action: 'accept' | 'reject'): Promise<void> {
  await apiFetch<void>(`/api/v1/teams/request/${requestId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

export async function apiGetAvailableProjects(cohortId: string): Promise<TeamProject[]> {
  const res = await apiFetch<RawProject[]>(`/api/v1/teams/projects/available?cohortId=${cohortId}`);
  return res.map(mapProject);
}

export async function apiProposeProject(cohortId: string, data: {
  title: string;
  description?: string;
  techStack?: string[];
  problemStatement?: string;
  endUsersDefined?: string;
}): Promise<TeamProject> {
  const p = await apiFetch<RawProject>('/api/v1/teams/projects/propose', {
    method: 'POST',
    body: JSON.stringify({ cohortId, ...data }),
  });
  return mapProject(p);
}

export async function apiSubmitProjectPreferences(
  cohortId: string,
  preference1Id: string,
  preference2Id: string
): Promise<TeamProjectPreferences> {
  const res = await apiFetch<RawPreferences>('/api/v1/teams/projects/preferences', {
    method: 'POST',
    body: JSON.stringify({ cohortId, preference1Id, preference2Id }),
  });
  return mapPreferences(res);
}

// Admin — lists every team formed within a cohort.
export async function apiListTeamsForCohort(cohortId: string): Promise<AdminTeam[]> {
  const res = await apiFetch<RawAdminTeam[]>(`/api/v1/teams/cohort/${cohortId}`);
  return res.map(mapAdminTeam);
}

// Admin — disbands a team, dropping its members back to the teammate-invite
// step. Used to reset test accounts without a manual DB query.
export async function apiBreakTeam(teamId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/teams/${teamId}`, { method: 'DELETE' });
}
