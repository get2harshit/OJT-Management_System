import type { ApiMentorRosterTeam, ApiTeamPerformanceWeek } from './api/teamRoster';

/**
 * Why a team was flagged. Always rendered next to the flag — a red badge with
 * no stated reason is a mentor's guess, not a signal, and the first thing
 * they'd have to do is go work out what it meant.
 */
export interface AttentionReason {
  code: 'attendance' | 'cadence' | 'overdue';
  label: string;
  detail: string;
}

/** Below this, over the recent window, attendance is worth a mentor's attention. */
export const ATTENDANCE_FLOOR_PCT = 75;
const ATTENDANCE_WINDOW_WEEKS = 4;
const SESSION_SILENCE_WEEKS = 2;

function tail(weeks: ApiTeamPerformanceWeek[], count: number): ApiTeamPerformanceWeek[] {
  return weeks.slice(Math.max(0, weeks.length - count));
}

/**
 * Recent attendance as a percentage, or null when nothing was marked.
 *
 * Null and 0 are different facts: nobody recorded attendance, versus everyone
 * was absent. Returning 0 for the first would flag every team whose mentor
 * simply hasn't marked a session yet.
 */
export function recentAttendancePct(team: ApiMentorRosterTeam): number | null {
  const window = tail(team.weeks, ATTENDANCE_WINDOW_WEEKS);
  const marked = window.reduce((n, w) => n + w.attendanceMarked, 0);
  if (marked === 0) return null;
  const present = window.reduce((n, w) => n + w.attendancePresent, 0);
  return Math.round((present / marked) * 100);
}

/**
 * The reasons this team needs attention, or an empty array if it doesn't.
 *
 * Three independent signals, each one a fact a mentor can act on directly.
 * Deliberately not combined into a single score — "team health: 62" tells a
 * mentor nothing about what to do next, while "no session in 2 weeks" does.
 */
export function teamAttentionReasons(team: ApiMentorRosterTeam): AttentionReason[] {
  const reasons: AttentionReason[] = [];

  const attendance = recentAttendancePct(team);
  if (attendance !== null && attendance < ATTENDANCE_FLOOR_PCT) {
    reasons.push({
      code: 'attendance',
      label: `${attendance}% attendance`,
      detail: `Below ${ATTENDANCE_FLOOR_PCT}% across the last ${ATTENDANCE_WINDOW_WEEKS} weeks.`,
    });
  }

  // Only a team with a cadence target can be behind on one — a team nobody
  // set a target for isn't failing anything.
  if (team.weeklySessionTarget !== null) {
    const recentSessions = tail(team.weeks, SESSION_SILENCE_WEEKS).reduce((n, w) => n + w.sessionsHeld, 0);
    if (recentSessions === 0) {
      reasons.push({
        code: 'cadence',
        label: `No session in ${SESSION_SILENCE_WEEKS} weeks`,
        detail: `This team's target is ${team.weeklySessionTarget} session${team.weeklySessionTarget === 1 ? '' : 's'} a week.`,
      });
    }
  }

  if (team.tasksOverdue > 0) {
    reasons.push({
      code: 'overdue',
      label: `${team.tasksOverdue} overdue task${team.tasksOverdue === 1 ? '' : 's'}`,
      detail: 'Past deadline and still not approved.',
    });
  }

  return reasons;
}
