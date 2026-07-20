import type {
  MyCohort,
  MyTeamStatus,
  Team,
  AdminTeam,
  PendingSentRequest,
  PendingReceivedRequest,
  TeamProjectPreferences,
  PreferenceReviewStatus,
  PendingProposal,
  AvailableTeammate,
  TeamAvailableMentor,
  TeamProject,
  ProposeProjectInput,
  SemesterSession,
  TeamWithProject,
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
  preference1MentorId?: string | null;
  preference2MentorId?: string | null;
  allocatedProjectId?: string | null;
  allocationStatus: 'pending' | 'allocated' | 'needs_review';
  preference1ReviewStatus: PreferenceReviewStatus;
  preference1ReviewNote?: string | null;
  submittedAt: string;
}

interface RawPendingProposal {
  preferenceId: string;
  teamId: string;
  track: string;
  submittedAt: string;
  members: { studentId: string; fullName: string | null }[];
  project: {
    id: string;
    title: string;
    description: string | null;
    problemStatement: string | null;
    techStack: string[];
  };
}

interface RawTeamMentor {
  id: string;
  organization?: string | null;
  is_external: boolean;
  track: string[];
  full_name: string;
  email?: string | null;
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
  project_id?: string | null;
  projectId?: string | null;
  course_covered?: string[];
  courseCovered?: string[];
  project_description?: string;
  projectDescription?: string;
  framework?: string[];
  suggested_libraries_tools?: string[];
  suggestedLibrariesTools?: string[];
  core_learning_goals?: string[];
  coreLearningGoals?: string[];
  stretch_goal?: string[];
  stretchGoal?: string[];
  evaluation_metrics?: string[];
  evaluationMetrics?: string[];
  expected_output?: string[];
  expectedOutput?: string[];
  first_month_milestones?: string[];
  firstMonthMilestones?: string[];
  second_month_milestones?: string[];
  secondMonthMilestones?: string[];
  third_month_milestones?: string[];
  thirdMonthMilestones?: string[];
  industry?: string;
  must_have_features?: string[];
  mustHaveFeatures?: string[];
  good_to_have_features?: string[];
  goodToHaveFeatures?: string[];
  level?: 'beginner' | 'intermediate' | 'advanced';
  // Server-computed, based on the requesting team's best member tier —
  // never a raw tier value itself (see TeamService.getAvailableProjects).
  isRecommended?: boolean;
}

interface RawMyCohort {
  cohortId: string;
  name?: string | null;
  sessionTerm: SemesterSession;
  allowedBatches?: string[];
}

interface RawMyTeamStatus {
  team: RawTeam | null;
  canInviteTeammate: boolean;
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
    preference1MentorId: p.preference1MentorId ?? null,
    preference2MentorId: p.preference2MentorId ?? null,
    allocatedProjectId: p.allocatedProjectId ?? null,
    allocationStatus: p.allocationStatus,
    preference1ReviewStatus: p.preference1ReviewStatus,
    preference1ReviewNote: p.preference1ReviewNote ?? null,
    submittedAt: p.submittedAt,
  };
}

function mapPendingProposal(p: RawPendingProposal): PendingProposal {
  return {
    preferenceId: p.preferenceId,
    teamId: p.teamId,
    track: mapBackendTrackToFrontend(p.track),
    submittedAt: p.submittedAt,
    members: p.members,
    project: p.project,
  };
}

function mapTeamMentor(m: RawTeamMentor): TeamAvailableMentor {
  return {
    id: m.id,
    fullName: m.full_name,
    email: m.email ?? undefined,
    organization: m.organization ?? undefined,
    isExternal: m.is_external,
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
    projectId: p.project_id ?? p.projectId ?? null,
    courseCovered: p.course_covered ?? p.courseCovered ?? undefined,
    projectDescription: p.project_description ?? p.projectDescription ?? undefined,
    framework: p.framework ?? undefined,
    suggestedLibrariesTools: p.suggested_libraries_tools ?? p.suggestedLibrariesTools ?? undefined,
    coreLearningGoals: p.core_learning_goals ?? p.coreLearningGoals ?? undefined,
    stretchGoal: p.stretch_goal ?? p.stretchGoal ?? undefined,
    evaluationMetrics: p.evaluation_metrics ?? p.evaluationMetrics ?? undefined,
    expectedOutput: p.expected_output ?? p.expectedOutput ?? undefined,
    firstMonthMilestones: p.first_month_milestones ?? p.firstMonthMilestones ?? undefined,
    secondMonthMilestones: p.second_month_milestones ?? p.secondMonthMilestones ?? undefined,
    thirdMonthMilestones: p.third_month_milestones ?? p.thirdMonthMilestones ?? undefined,
    industry: p.industry ?? undefined,
    mustHaveFeatures: p.must_have_features ?? p.mustHaveFeatures ?? undefined,
    goodToHaveFeatures: p.good_to_have_features ?? p.goodToHaveFeatures ?? undefined,
    level: p.level ?? undefined,
    isRecommended: p.isRecommended ?? false,
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
    canInviteTeammate: res.canInviteTeammate,
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

// Used by students who can't invite a teammate (batch-mandated individual,
// or an admin-granted override) to form their own single-member team.
export async function apiCreateIndividualTeam(cohortId: string, track: string): Promise<Team> {
  const res = await apiFetch<RawTeam>('/api/v1/teams/individual', {
    method: 'POST',
    body: JSON.stringify({ cohortId, track: mapFrontendTrackToBackend(track) }),
  });
  return mapTeam(res);
}

// Admin — grants or revokes a specific student's permission to form an
// individual team within a cohort, independent of their batch.
export async function apiSetIndividualOverride(studentId: string, cohortId: string, allowed: boolean): Promise<void> {
  await apiFetch<void>(`/api/v1/teams/individual-override/${studentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ cohortId, allowed }),
  });
}

export async function apiGetAvailableProjects(cohortId: string): Promise<TeamProject[]> {
  const res = await apiFetch<RawProject[]>(`/api/v1/teams/projects/available?cohortId=${cohortId}`);
  return res.map(mapProject);
}

export async function apiProposeProject(cohortId: string, data: ProposeProjectInput): Promise<TeamProject> {
  const p = await apiFetch<RawProject>('/api/v1/teams/projects/propose', {
    method: 'POST',
    body: JSON.stringify({ cohortId, ...data }),
  });
  return mapProject(p);
}

export async function apiGetAvailableMentors(cohortId: string): Promise<TeamAvailableMentor[]> {
  const res = await apiFetch<RawTeamMentor[]>(`/api/v1/teams/mentors/available?cohortId=${cohortId}`);
  return res.map(mapTeamMentor);
}

export async function apiSubmitProjectPreferences(
  cohortId: string,
  preference1Id: string,
  preference2Id: string,
  preference1MentorId: string,
  preference2MentorId: string
): Promise<TeamProjectPreferences> {
  const res = await apiFetch<RawPreferences>('/api/v1/teams/projects/preferences', {
    method: 'POST',
    body: JSON.stringify({ cohortId, preference1Id, preference2Id, preference1MentorId, preference2MentorId }),
  });
  return mapPreferences(res);
}

// Team — replaces a mentor-rejected preference-1 with a new project and/or
// mentor, looping it back to pending review.
export async function apiResubmitPreference1(cohortId: string, projectId: string, mentorId: string): Promise<TeamProjectPreferences> {
  const res = await apiFetch<RawPreferences>('/api/v1/teams/projects/preferences/resubmit', {
    method: 'POST',
    body: JSON.stringify({ cohortId, projectId, mentorId }),
  });
  return mapPreferences(res);
}

// Mentor — self-proposed preference-1 projects awaiting this mentor's decision.
export async function apiGetPendingProposals(): Promise<PendingProposal[]> {
  const res = await apiFetch<RawPendingProposal[]>('/api/v1/teams/proposals/pending');
  return res.map(mapPendingProposal);
}

// Mentor — approves or rejects a self-proposed preference-1, with an optional note.
export async function apiDecideOnProposal(preferenceId: string, action: 'approve' | 'reject', note?: string): Promise<void> {
  await apiFetch<void>(`/api/v1/teams/proposals/${preferenceId}/decide`, {
    method: 'POST',
    body: JSON.stringify({ action, note }),
  });
}

// Admin — lists every team formed within a cohort.
export async function apiListTeamsForCohort(cohortId: string): Promise<AdminTeam[]> {
  const res = await apiFetch<RawAdminTeam[]>(`/api/v1/teams/cohort/${cohortId}`);
  return res.map(mapAdminTeam);
}

// Mentor — lists the teams this mentor is currently allocated to, used by
// the mentor task-creation flow's team picker.
export async function apiListMyTeams(): Promise<Team[]> {
  const res = await apiFetch<RawTeam[]>('/api/v1/teams/my-teams');
  return res.map(mapTeam);
}

interface RawTeamMentorDetail {
  teamId: string;
  track: string;
  isIndividual: boolean;
  members: { studentId: string; fullName: string | null; rollNumber: string | null }[];
  project: { id: string; title: string; description: string | null; track: string } | null;
}

// Mentor — same team scope as apiListMyTeams, with each team's allocated
// project (title/description) attached, for the OJTs & Projects page's
// team → project drill-down.
export async function apiListMyTeamsDetailed(): Promise<TeamWithProject[]> {
  const res = await apiFetch<RawTeamMentorDetail[]>('/api/v1/teams/my-teams/detailed');
  return res.map((t) => ({
    teamId: t.teamId,
    track: mapBackendTrackToFrontend(t.track),
    isIndividual: t.isIndividual,
    members: t.members,
    project: t.project
      ? { ...t.project, track: mapBackendTrackToFrontend(t.project.track) }
      : null,
  }));
}

// Admin — disbands a team, dropping its members back to the teammate-invite
// step. Used to reset test accounts without a manual DB query.
export async function apiBreakTeam(teamId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/teams/${teamId}`, { method: 'DELETE' });
}
