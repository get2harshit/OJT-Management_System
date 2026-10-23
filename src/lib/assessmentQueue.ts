import type { ApiMentorRosterStudent } from './api/teamRoster';
import { isAssessedThisWeek, isDueThisWeek } from './weeklyAssessments';

/**
 * Rules for walking a mentor through this week's assessments one student
 * after another. Pure, so the order a mentor is led in can be reasoned about
 * without the dialog around it.
 *
 * `savedIds` are students assessed during this sitting. The roster refreshes
 * in the background after each save, so for a moment it still calls a
 * just-assessed student `due` — these ids win over that stale answer.
 */

export interface WeeklyAssessmentProgress {
  done: number;
  pending: number;
  /** Students this week's rule applies to — `done + pending`. */
  total: number;
}

function isPending(student: ApiMentorRosterStudent, savedIds: ReadonlySet<string>): boolean {
  return isDueThisWeek(student.weeklyAssessments) && !savedIds.has(student.id);
}

/**
 * This week's count across the whole roster. Students the rule does not
 * cover yet (weeks before it began, or before this mentor took them over)
 * are in neither number.
 */
export function summarizeWeeklyProgress(
  students: ApiMentorRosterStudent[],
  savedIds: ReadonlySet<string>
): WeeklyAssessmentProgress {
  let done = 0;
  let pending = 0;
  for (const student of students) {
    if (isPending(student, savedIds)) pending += 1;
    else if (savedIds.has(student.id) || isAssessedThisWeek(student.weeklyAssessments)) done += 1;
  }
  return { done, pending, total: done + pending };
}

/**
 * The next student to assess after `afterId`: the first one still pending
 * and not skipped, looking forward from `afterId` in `order` and wrapping to
 * the top. Null when nobody is left, skipped students aside — the caller
 * decides whether to offer those again.
 */
export function pickNextStudent({
  order,
  studentsById,
  savedIds,
  skippedIds,
  afterId,
}: {
  order: string[];
  studentsById: ReadonlyMap<string, ApiMentorRosterStudent>;
  savedIds: ReadonlySet<string>;
  skippedIds: ReadonlySet<string>;
  afterId: string | null;
}): string | null {
  const start = afterId === null ? 0 : order.indexOf(afterId) + 1;
  const lookingForward = [...order.slice(start), ...order.slice(0, start)];
  return (
    lookingForward.find((id) => {
      if (id === afterId || skippedIds.has(id)) return false;
      const student = studentsById.get(id);
      return student !== undefined && isPending(student, savedIds);
    }) ?? null
  );
}

/** Skipped students who are still pending — the ones a mentor can be offered a second pass at. */
export function countSkippedStillPending(
  studentsById: ReadonlyMap<string, ApiMentorRosterStudent>,
  savedIds: ReadonlySet<string>,
  skippedIds: ReadonlySet<string>
): number {
  let count = 0;
  for (const id of skippedIds) {
    const student = studentsById.get(id);
    if (student && isPending(student, savedIds)) count += 1;
  }
  return count;
}
