import type { ApiWeeklyAssessment } from '../lib/api/teamRoster';
import { formatInIST } from '../lib/utils';
import {
  WEEKLY_STATUS_STYLE,
  countMissedWeeks,
  formatRatingChange,
  latestRatingChange,
} from '../lib/weeklyAssessments';

function describeWeek(week: ApiWeeklyAssessment): string {
  const parts = [`Week of ${formatInIST(week.weekStart, { day: '2-digit', month: 'short' })}`, WEEKLY_STATUS_STYLE[week.status].label];
  if (week.assessmentCount > 1) parts.push(`${week.assessmentCount} assessments`);
  if (week.finalRating !== null) {
    parts.push(`rating ${week.finalRating.toFixed(2)}${week.change !== null ? ` (${formatRatingChange(week.change)})` : ''}`);
  }
  return parts.join(' · ');
}

/**
 * One square per OJT week — whether the weekly assessment was done — plus the
 * latest rating change. A missed week is a red square, never a drop in the
 * rating: the backend carries the last rating across it.
 */
export default function WeeklyAssessmentStrip({ weeks }: { weeks: ApiWeeklyAssessment[] }) {
  if (weeks.length === 0) return null;
  const change = latestRatingChange(weeks);
  const missed = countMissedWeeks(weeks);

  return (
    <span
      className="inline-flex items-center gap-1.5"
      role="img"
      aria-label={`Weekly assessments: ${missed} missed of ${weeks.length} weeks${change !== null ? `, latest change ${formatRatingChange(change)}` : ''}`}
    >
      <span className="inline-flex items-center gap-0.5">
        {weeks.map((week) => (
          <span
            key={week.weekStart}
            title={describeWeek(week)}
            className={`w-2 h-2 rounded-[2px] border ${WEEKLY_STATUS_STYLE[week.status].box}`}
          />
        ))}
      </span>
      {change !== null && change !== 0 && (
        <span className={`tabular-nums font-semibold ${change > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {change > 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}
        </span>
      )}
    </span>
  );
}
