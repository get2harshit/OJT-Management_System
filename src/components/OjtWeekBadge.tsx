import { CalendarRange } from 'lucide-react';
import { getOjtWeek, formatDateDisplay } from '../lib/utils';

interface Props {
  startDate: string | null | undefined;
  endDate: string | null | undefined;
  className?: string;
}

/**
 * "Week 6 of 24" for an OJT, shown identically to admins, mentors and
 * students so all three are talking about the same week. Renders nothing when
 * the cohort's dates aren't known yet, rather than guessing at a number.
 */
export default function OjtWeekBadge({ startDate, endDate, className = '' }: Props) {
  if (!startDate || !endDate) return null;

  const week = getOjtWeek(startDate, endDate);
  if (!week) return null;

  const toneClass =
    week.status === 'running'
      ? 'bg-gold/10 text-gold border-gold/30'
      : 'bg-zinc-800 text-gray-400 border-zinc-700';

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${toneClass} ${className}`}
      title={`${formatDateDisplay(startDate)} — ${formatDateDisplay(endDate)}`}
    >
      <CalendarRange size={12} className="shrink-0" />
      {week.label}
    </span>
  );
}
