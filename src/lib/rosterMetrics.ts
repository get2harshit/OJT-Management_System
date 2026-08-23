/**
 * Shared read-only derivations off a roster student/team record — used by
 * both the Overview glance lists and the Students tab's row stats, so the
 * two screens can never disagree about what "82% attendance" or "3/4 tasks"
 * means for the same student.
 */

/** Percentage of this student's currently-tracked tasks that are approved. Null (not 0%) when they have no tasks at all yet. */
export function taskCoveragePct(counts: { tasksApproved: number; tasksOpen: number; tasksNeedingResubmit: number }): number | null {
  const total = counts.tasksApproved + counts.tasksOpen + counts.tasksNeedingResubmit;
  if (total === 0) return null;
  return Math.round((counts.tasksApproved / total) * 100);
}

/** Percentage of marked sessions this student/team was present for. Null (not 0%) when nothing has been marked yet. */
export function attendancePct(counts: { attendancePresent: number; attendanceMarked: number }): number | null {
  if (counts.attendanceMarked === 0) return null;
  return Math.round((counts.attendancePresent / counts.attendanceMarked) * 100);
}
