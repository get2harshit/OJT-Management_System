import type { ApiWeeklyAssessment, ApiWeeklyAssessmentStatus } from './api/teamRoster';

/**
 * How each week of the weekly assessment rule (at least one per student per
 * week) is drawn. One table, so the legend and the squares cannot disagree.
 */
export const WEEKLY_STATUS_STYLE: Record<ApiWeeklyAssessmentStatus, { box: string; label: string }> = {
  assessed: { box: 'bg-emerald-500/80 border-emerald-500/80', label: 'Assessed' },
  missed: { box: 'bg-red-500/80 border-red-500/80', label: 'Missed' },
  due: { box: 'bg-transparent border-amber-400 border-dashed', label: 'Due this week' },
  not_tracked: { box: 'bg-zinc-800 border-zinc-750', label: 'Not tracked' },
};

/** The most recent week-over-week change, so a row can say "growing" or "slipping" without a chart. */
export function latestRatingChange(weeks: ApiWeeklyAssessment[]): number | null {
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].finalRating !== null) return weeks[i].change;
  }
  return null;
}

export function countMissedWeeks(weeks: ApiWeeklyAssessment[]): number {
  return weeks.filter((w) => w.status === 'missed').length;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The bucket for the week we are in, or null once the OJT's last week has
 * passed — the roster's final bucket is only "this week" while it still is.
 */
export function currentWeek(weeks: ApiWeeklyAssessment[], now: Date = new Date()): ApiWeeklyAssessment | null {
  if (weeks.length === 0) return null;
  const latest = weeks[weeks.length - 1];
  const startsAt = new Date(latest.weekStart).getTime();
  return now.getTime() >= startsAt && now.getTime() < startsAt + WEEK_MS ? latest : null;
}

/**
 * True when this week's assessment is still outstanding — the one gap a mentor
 * can still close. The server only ever marks the current week `due`, so its
 * word is taken as is rather than second-guessed against this machine's clock.
 */
export function isDueThisWeek(weeks: ApiWeeklyAssessment[]): boolean {
  return weeks.length > 0 && weeks[weeks.length - 1].status === 'due';
}

/** True when this week's minimum is already met, so another assessment would be an extra one. */
export function isAssessedThisWeek(weeks: ApiWeeklyAssessment[]): boolean {
  return currentWeek(weeks)?.status === 'assessed';
}

export function formatRatingChange(change: number): string {
  return `${change > 0 ? '+' : ''}${change.toFixed(2)}`;
}
