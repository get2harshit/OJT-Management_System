// Team roster changes, mentor reassignment, and mentor groups.
//
// The roster/reassign endpoints share one deliberate shape: anything that
// would disturb sessions ALREADY on the calendar is blocked with a 409 until
// the caller opts in with cascadeFutureSessions. Nothing here ever touches a
// completed session — history is fixed. Callers should treat the 409 as a
// question to put to the user, not an error to swallow.
//
// Same raw-passthrough convention as sessions.ts.
import { apiFetch, invalidateCached } from './client';

export interface ApiMentorGroup {
  id: string;
  mentor_id: string;
  cohort_id: string;
  name: string;
  created_by_id: string;
  created_at: string;
  meeting_pattern_type: 'weekdays' | 'interval' | null;
  meeting_weekdays: number[];
  meeting_interval_days: number | null;
  meeting_interval_anchor: string | null;
}

/**
 * A group's recurring meeting pattern — purely descriptive (seeds a default
 * cadence target on the teams that join, and drives UI suggestions), never
 * auto-creates a session. `null` clears whatever pattern was set. 'weekdays'
 * covers any combination of days, not just presets like Mon/Wed/Fri;
 * 'interval' covers "every N days" patterns (alternate days = intervalDays: 2)
 * that don't line up with a fixed weekly weekday set.
 */
export type MeetingPattern =
  | { type: 'weekdays'; weekdays: number[] }
  | { type: 'interval'; intervalDays: number; anchorDate: string }
  | null;

/**
 * Thrown for the 409 the roster endpoints raise when a change would affect
 * upcoming sessions. Carries the count so the UI can say how many rather
 * than just that there are some.
 */
export class FutureSessionsConflictError extends Error {
  readonly futureSessionCount: number;
  constructor(message: string, futureSessionCount: number) {
    super(message);
    this.name = 'FutureSessionsConflictError';
    this.futureSessionCount = futureSessionCount;
  }
}

/**
 * apiFetch flattens every failure into a plain Error, so the 409 is
 * recognised by its message shape here. The backend's wording ("This team
 * has N upcoming session(s)...") is the contract being read.
 */
export function asConflict(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  const match = /has (\d+) upcoming session/i.exec(message);
  if (match) {
    throw new FutureSessionsConflictError(message, Number(match[1]));
  }
  throw error;
}

export interface ApiTeamRosterMentor {
  mentorId: string | null;
  mentorName: string | null;
  groupId: string | null;
}

/**
 * The mentor these roster operations actually act on.
 *
 * Deliberately not the same field as the teams list's allocatedMentorId —
 * that one is the mentor on the team's project allocation, and the two can
 * legitimately differ. A screen that reassigns mentors has to show the one it
 * will change.
 */
export async function apiGetTeamRosterMentor(teamId: string): Promise<ApiTeamRosterMentor> {
  const res = await apiFetch<{ data: ApiTeamRosterMentor }>(`/api/v1/teams/${teamId}/roster-mentor`);
  return res.data;
}

export async function apiAddTeamMember(teamId: string, studentId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/teams/${teamId}/members`, {
    method: 'POST',
    body: JSON.stringify({ studentId }),
  });
  invalidateCached('teams');
}

/**
 * Removing a student from a team with upcoming sessions is refused unless
 * cascadeFutureSessions is set, in which case their attendance on those
 * sessions is marked excused rather than deleted.
 */
export async function apiRemoveTeamMember(
  teamId: string,
  studentId: string,
  options: { reason?: string; cascadeFutureSessions?: boolean } = {}
): Promise<void> {
  try {
    await apiFetch<void>(`/api/v1/teams/${teamId}/members/${studentId}/remove`, {
      method: 'POST',
      body: JSON.stringify({ reason: options.reason, cascadeFutureSessions: options.cascadeFutureSessions ?? false }),
    });
  } catch (error) {
    asConflict(error);
  }
  invalidateCached('teams');
  invalidateCached('sessions');
}

/**
 * Reassigning a team whose current mentor has upcoming sessions is refused
 * unless cascadeFutureSessions is set, in which case those sessions move to
 * the new mentor and re-snapshot their rate.
 */
export async function apiReassignTeamMentor(
  teamId: string,
  toMentorId: string,
  options: { reason?: string; cascadeFutureSessions?: boolean } = {}
): Promise<{ movedSessions: number }> {
  try {
    const res = await apiFetch<{ data: { movedSessions: number } }>(`/api/v1/teams/${teamId}/reassign-mentor`, {
      method: 'POST',
      body: JSON.stringify({
        toMentorId,
        reason: options.reason,
        cascadeFutureSessions: options.cascadeFutureSessions ?? false,
      }),
    });
    invalidateCached('teams');
    invalidateCached('sessions');
    return res.data;
  } catch (error) {
    asConflict(error);
  }
}

/**
 * Purely organisational, so unlike the two above it needs no cascade check —
 * sessions bind to the team directly, never to the group. Pass null to
 * ungroup. Rejected if the target group belongs to a different mentor.
 */
export async function apiMoveTeamToGroup(teamId: string, groupId: string | null, reason?: string): Promise<void> {
  await apiFetch<void>(`/api/v1/teams/${teamId}/group`, {
    method: 'PATCH',
    body: JSON.stringify({ groupId, reason }),
  });
  invalidateCached('teams');
  invalidateCached('mentor-groups');
}

export async function apiListMentorGroups(cohortId: string, mentorId: string): Promise<ApiMentorGroup[]> {
  const res = await apiFetch<{ data: ApiMentorGroup[] }>(`/api/v1/cohorts/${cohortId}/mentors/${mentorId}/groups`);
  return res.data;
}

export async function apiCreateMentorGroup(
  cohortId: string,
  mentorId: string,
  name: string,
  meetingPattern?: MeetingPattern
): Promise<ApiMentorGroup> {
  const res = await apiFetch<{ data: ApiMentorGroup }>(`/api/v1/cohorts/${cohortId}/mentors/${mentorId}/groups`, {
    method: 'POST',
    body: JSON.stringify({ name, meetingPattern }),
  });
  invalidateCached('mentor-groups');
  return res.data;
}

export async function apiSetGroupMeetingPattern(
  cohortId: string,
  mentorId: string,
  groupId: string,
  meetingPattern: MeetingPattern
): Promise<ApiMentorGroup> {
  const res = await apiFetch<{ data: ApiMentorGroup }>(
    `/api/v1/cohorts/${cohortId}/mentors/${mentorId}/groups/${groupId}/meeting-pattern`,
    { method: 'PATCH', body: JSON.stringify({ meetingPattern }) }
  );
  invalidateCached('mentor-groups');
  return res.data;
}

export type CadenceStatus = 'met' | 'behind' | 'no_target';

export interface ApiMentorWorkspaceTeam {
  id: string;
  name: string | null;
  memberCount: number;
  groupId: string | null;
  groupName: string | null;
  weeklySessionTarget: number | null;
  sessionsThisWeek: number;
  cadenceStatus: CadenceStatus;
  allocatedProjectTitle: string | null;
}

export interface ApiMentorWorkspace {
  mentor: { id: string; full_name: string; email: string; is_external: boolean };
  groups: ApiMentorGroup[];
  teams: ApiMentorWorkspaceTeam[];
  rate: { amount: string; type: string; currency: string } | null;
  // Across every student in this mentor's teams for this cohort — pending
  // (submitted/under_review) vs reviewed (approved/changes_requested).
  submissions: { pending: number; reviewed: number };
  // Tasks this mentor has personally created/assigned in this cohort, not
  // tasks assigned to her teams — see MentorWorkspace.tsx's Tasks card.
  tasksAssignedCount: number;
  selfScheduleAllowed: boolean;
  scheduleOverride: { workingDays: number[]; dayStartMinute: number; dayEndMinute: number } | null;
}

/**
 * The "mentor = manager" overview for one mentor in one cohort — their
 * groups, every team under them with this week's cadence status, rate, and
 * schedule, in one call. Bounded query count on the backend regardless of
 * team count, so this is safe to call whenever the workspace screen mounts
 * or a mutation on it settles, no separate per-team fetches needed.
 */
export async function apiGetMentorWorkspace(cohortId: string, mentorId: string): Promise<ApiMentorWorkspace> {
  const res = await apiFetch<{ data: ApiMentorWorkspace }>(`/api/v1/cohorts/${cohortId}/mentors/${mentorId}/workspace`);
  return res.data;
}

/**
 * Sets (or clears, with null) how many sessions a week this team's mentor
 * should meet them. A soft target only — nothing gets auto-scheduled, the
 * workspace screen just tracks the actual count against it.
 */
export async function apiSetTeamCadence(teamId: string, weeklySessionTarget: number | null): Promise<void> {
  await apiFetch<void>(`/api/v1/teams/${teamId}/cadence`, {
    method: 'PATCH',
    body: JSON.stringify({ weeklySessionTarget }),
  });
}

/**
 * How many teams in one cohort currently report to each of the given
 * mentors — one call for a whole directory page, not one per mentor.
 * Mentors with no teams are still present in the result, at 0.
 */
export async function apiGetTeamCountsForMentors(cohortId: string, mentorIds: string[]): Promise<Record<string, number>> {
  if (mentorIds.length === 0) return {};
  const res = await apiFetch<{ data: Record<string, number> }>(
    `/api/v1/teams/mentor-team-counts?cohortId=${cohortId}&mentorIds=${mentorIds.join(',')}`
  );
  return res.data;
}

export type StudentActivityEvent =
  | { type: 'team_joined' | 'team_left'; at: string; teamId: string; teamName: string | null; changedById: string; reason: string | null }
  | {
      type: 'mentor_changed';
      at: string;
      teamId: string;
      teamName: string | null;
      fromMentorId: string | null;
      fromMentorName: string | null;
      toMentorId: string;
      toMentorName: string | null;
      changedById: string;
      reason: string | null;
    }
  | {
      type: 'project_changed';
      at: string;
      teamId: string;
      teamName: string | null;
      // Both ends are nullable: a first allocation comes from no project, and
      // reversing one goes back to no project.
      fromProjectId: string | null;
      fromProjectTitle: string | null;
      toProjectId: string | null;
      toProjectTitle: string | null;
      changedById: string;
      reason: string | null;
    };

/**
 * This student's team-join/leave, mentor-change and project-change history,
 * most recent first. Built from ojt_team_membership_events,
 * ojt_mentor_reassignment_history and ojt_team_project_history — a mentor or
 * project change only appears here if it happened while this student was
 * actually on that team.
 *
 * Track changes are deliberately absent rather than missing: a team's track is
 * set when the team forms and no code path ever updates it, so there is no
 * such event for this to show.
 */
export async function apiGetStudentActivityHistory(studentId: string): Promise<StudentActivityEvent[]> {
  const res = await apiFetch<{ data: StudentActivityEvent[] }>(`/api/v1/teams/students/${studentId}/activity`);
  return res.data;
}

export interface ApiTeamPerformanceWeek {
  /** ISO timestamp of the week's Monday 00:00 UTC. */
  weekStart: string;
  tasksApproved: number;
  sessionsHeld: number;
  /**
   * Present and total-marked stay separate on purpose: a week where nothing
   * was marked is "no data", not 0% attendance, and the UI has to be able to
   * tell those apart.
   */
  attendancePresent: number;
  attendanceMarked: number;
}

export interface ApiTeamPerformance {
  weeks: ApiTeamPerformanceWeek[];
  openTasks: number;
  tasksNeedingResubmit: number;
  memberCount: number;
}

/**
 * One team's week-by-week record — tasks approved, sessions held, attendance —
 * plus its current open/needs-resubmit task counts.
 *
 * Returns the raw signals rather than a single score by design: an invented
 * composite reads as authoritative and hides the very inputs a mentor can act
 * on. `weeks` is clamped server-side to 1..26.
 */
export async function apiGetTeamPerformance(teamId: string, weeks = 8): Promise<ApiTeamPerformance> {
  const res = await apiFetch<{ data: ApiTeamPerformance }>(`/api/v1/teams/${teamId}/performance?weeks=${weeks}`);
  return res.data;
}
