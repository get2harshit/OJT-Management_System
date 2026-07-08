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
} from '../types';
import { apiFetch } from './client';
import { mapFrontendTrackToBackend, mapBackendTrackToFrontend } from './trackMapping';

function mapTeam(t: any): Team {
  return {
    id: t.id,
    track: mapBackendTrackToFrontend(t.track),
    isIndividual: t.isIndividual,
    members: (t.members || []).map((m: any) => ({
      studentId: m.studentId,
      fullName: m.fullName ?? null,
    })),
  };
}

function mapAdminTeam(t: any): AdminTeam {
  return {
    ...mapTeam(t),
    createdAt: t.createdAt,
    hasSubmittedProjectPreferences: !!t.hasSubmittedProjectPreferences,
  };
}

function mapSentRequest(r: any): PendingSentRequest {
  return {
    id: r.id,
    receiverId: r.receiverId,
    receiverName: r.receiverName ?? null,
    track: mapBackendTrackToFrontend(r.track),
    expiresAt: r.expiresAt,
  };
}

function mapReceivedRequest(r: any): PendingReceivedRequest {
  return {
    id: r.id,
    senderId: r.senderId,
    senderName: r.senderName ?? null,
    track: mapBackendTrackToFrontend(r.track),
    expiresAt: r.expiresAt,
  };
}

function mapPreferences(p: any): TeamProjectPreferences {
  return {
    id: p.id,
    teamId: p.teamId,
    preference1Id: p.preference1Id,
    preference2Id: p.preference2Id,
    allocatedProjectId: p.allocatedProjectId ?? null,
    submittedAt: p.submittedAt,
  };
}

function mapProject(p: any): TeamProject {
  return {
    id: p.id,
    title: p.title,
    description: p.description ?? undefined,
    track: mapBackendTrackToFrontend(p.track),
    techStack: p.tech_stack ?? p.techStack ?? [],
    problemStatement: p.problem_statement ?? p.problemStatement ?? undefined,
    endUsersDefined: p.end_users_defined ?? p.endUsersDefined ?? undefined,
    projectBy: p.project_by ?? p.projectBy,
    createdByTeamId: p.created_by_team_id ?? p.createdByTeamId ?? null,
  };
}

export async function apiGetMyCohort(): Promise<MyCohort> {
  const res = await apiFetch<any>('/api/v1/teams/my-cohort');
  return {
    cohortId: res.cohortId,
    name: res.name ?? null,
    sessionTerm: res.sessionTerm,
    allowedBatches: res.allowedBatches ?? [],
  };
}

export async function apiGetMyTeamStatus(cohortId: string): Promise<MyTeamStatus> {
  const res = await apiFetch<any>(`/api/v1/teams/my-status?cohortId=${cohortId}`);
  return {
    team: res.team ? mapTeam(res.team) : null,
    pendingSentRequest: res.pendingSentRequest ? mapSentRequest(res.pendingSentRequest) : null,
    pendingReceivedRequest: res.pendingReceivedRequest ? mapReceivedRequest(res.pendingReceivedRequest) : null,
    projectPreferences: res.projectPreferences ? mapPreferences(res.projectPreferences) : null,
  };
}

export async function apiGetAvailableTeammates(cohortId: string): Promise<AvailableTeammate[]> {
  const res = await apiFetch<any[]>(`/api/v1/teams/available-teammates?cohortId=${cohortId}`);
  return res.map(s => ({
    studentId: s.id,
    rollNumber: s.roll_number,
    batch: s.batch,
    fullName: s.full_name,
  }));
}

export async function apiSendTeamRequest(receiverId: string, cohortId: string, track: string): Promise<void> {
  await apiFetch<any>('/api/v1/teams/request', {
    method: 'POST',
    body: JSON.stringify({ receiverId, cohortId, track: mapFrontendTrackToBackend(track) }),
  });
}

export async function apiRespondToTeamRequest(requestId: string, action: 'accept' | 'reject'): Promise<void> {
  await apiFetch<any>(`/api/v1/teams/request/${requestId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

export async function apiGetAvailableProjects(cohortId: string): Promise<TeamProject[]> {
  const res = await apiFetch<any[]>(`/api/v1/teams/projects/available?cohortId=${cohortId}`);
  return res.map(mapProject);
}

export async function apiProposeProject(cohortId: string, data: {
  title: string;
  description?: string;
  techStack?: string[];
  problemStatement?: string;
  endUsersDefined?: string;
}): Promise<TeamProject> {
  const p = await apiFetch<any>('/api/v1/teams/projects/propose', {
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
  const res = await apiFetch<any>('/api/v1/teams/projects/preferences', {
    method: 'POST',
    body: JSON.stringify({ cohortId, preference1Id, preference2Id }),
  });
  return mapPreferences(res);
}

// Admin — lists every team formed within a cohort.
export async function apiListTeamsForCohort(cohortId: string): Promise<AdminTeam[]> {
  const res = await apiFetch<any[]>(`/api/v1/teams/cohort/${cohortId}`);
  return res.map(mapAdminTeam);
}

// Admin — disbands a team, dropping its members back to the teammate-invite
// step. Used to reset test accounts without a manual DB query.
export async function apiBreakTeam(teamId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/teams/${teamId}`, { method: 'DELETE' });
}
