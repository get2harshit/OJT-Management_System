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
}

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
function asConflict(error: unknown): never {
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

export async function apiCreateMentorGroup(cohortId: string, mentorId: string, name: string): Promise<ApiMentorGroup> {
  const res = await apiFetch<{ data: ApiMentorGroup }>(`/api/v1/cohorts/${cohortId}/mentors/${mentorId}/groups`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  invalidateCached('mentor-groups');
  return res.data;
}
