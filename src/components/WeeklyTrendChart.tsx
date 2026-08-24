import { useState, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import type { ApiTeamPerformanceWeek } from '../lib/api/teamRoster';

export interface WeeklyTrendChartProps {
  title: string;
  weeks: ApiTeamPerformanceWeek[];
  /** Return null for a week nothing was recorded for — it is drawn as no data, never as zero. */
  valueOf: (week: ApiTeamPerformanceWeek) => number | null;
  format: (value: number) => string;
  /** Fixed axis top, for measures like a percentage whose scale is known. */
  max?: number;
  /** Compact drops the header row, for an inline sparkline inside a table. */
  compact?: boolean;
}

/**
 * One measure across a run of weeks.
 *
 * Three states are drawn distinctly — a value, a real zero, and a week nothing
 * was recorded for — because drawing "not recorded" as a bar of any height
 * claims a measurement nobody took. Direction is carried by an arrow and a
 * signed number, never colour alone.
 */
export default function WeeklyTrendChart({ title, weeks, valueOf, format, max, compact = false }: WeeklyTrendChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  const values = useMemo(() => weeks.map(valueOf), [weeks, valueOf]);
  const scaleTop = useMemo(() => {
    if (max !== undefined) return max;
    const highest = Math.max(...values.map((v) => v ?? 0));
    return highest > 0 ? highest : 1;
  }, [values, max]);

  const latest = values[values.length - 1];
  const previous = values[values.length - 2];
  const delta =
    latest !== null && latest !== undefined && previous !== null && previous !== undefined ? latest - previous : null;

  return (
    <div className={compact ? '' : 'bg-zinc-900 border border-zinc-750 rounded-lg p-3'}>
      {!compact && (
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-400">{title}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">this week</span>
            <span className="text-sm font-bold text-white tabular-nums">
              {latest === null || latest === undefined ? '—' : format(latest)}
            </span>
            <DeltaBadge delta={delta} format={format} />
          </div>
        </div>
      )}

      {/* Every bar sits on one shared baseline, so a zero week reads as a gap
          against the line rather than as a missing bar. The last bar is the
          current, still-incomplete week and is the only one at full strength. */}
      <div
        className={`flex items-end gap-[2px] border-b border-zinc-750 ${compact ? 'h-6' : 'h-12'}`}
        role="img"
        aria-label={`${title} over the last ${weeks.length} weeks`}
      >
        {weeks.map((week, i) => {
          const value = values[i];
          const isLatest = i === weeks.length - 1;
          return (
            <div
              key={week.weekStart}
              className="relative flex-1 h-full flex items-end"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {value === null ? (
                <div className="w-full h-[3px] rounded-full bg-zinc-750" />
              ) : value === 0 ? (
                <div className="w-full h-[3px] rounded-full bg-zinc-700" />
              ) : (
                <div
                  className={`w-full rounded-t ${isLatest ? 'bg-gold' : 'bg-gold/40'}`}
                  style={{ height: `${Math.max(8, (value / scaleTop) * 100)}%` }}
                />
              )}

              {hovered === i && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-20 whitespace-nowrap px-2 py-1 rounded-md bg-zinc-800 border border-zinc-700 text-[11px] text-gray-200 shadow-lg pointer-events-none">
                  <span className="text-gray-400">{weekLabel(week.weekStart)}</span>
                  {' · '}
                  {compact ? `${title}: ` : ''}
                  {value === null ? 'not recorded' : format(value)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Change against the previous week. Ships an arrow and a signed number, not
 * just a colour, so the direction survives colour-blindness and greyscale.
 */
export function DeltaBadge({ delta, format }: { delta: number | null; format: (value: number) => string }) {
  if (delta === null) return <span className="text-[11px] text-gray-500">no prior week</span>;

  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-400">
        <Minus size={11} />
        no change
      </span>
    );
  }

  const up = delta > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${up ? 'text-green-400' : 'text-red-400'}`}>
      <Icon size={11} />
      {up ? '+' : '−'}
      {format(Math.abs(delta))}
    </span>
  );
}

export function weekLabel(weekStartIso: string): string {
  const start = new Date(weekStartIso);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  return `${fmt(start)} – ${fmt(end)}`;
}

/** The three measures every trend view shows, so they can't drift apart. */
export const TREND_MEASURES: { title: string; valueOf: WeeklyTrendChartProps['valueOf']; format: (v: number) => string; max?: number }[] = [
  { title: 'Tasks approved', valueOf: (w) => w.tasksApproved, format: (v) => String(v) },
  { title: 'Sessions held', valueOf: (w) => w.sessionsHeld, format: (v) => String(v) },
  {
    title: 'Attendance',
    // Null, not 0, when nothing was marked — an unmarked week is missing data,
    // and drawing it as 0% would read as everyone being absent.
    valueOf: (w) => (w.attendanceMarked === 0 ? null : Math.round((w.attendancePresent / w.attendanceMarked) * 100)),
    format: (v) => `${v}%`,
    max: 100,
  },
];
