import { useState, useEffect, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus, Loader2 } from 'lucide-react';
import { apiGetTeamPerformance, type ApiTeamPerformance, type ApiTeamPerformanceWeek } from '../lib/api/teamRoster';

const WEEKS = 8;

/**
 * A team's last few weeks, as three separate measures rather than one score.
 *
 * There is deliberately no composite "team score": a single invented number
 * reads as authoritative and hides exactly the inputs a mentor can act on. The
 * three measures are also on different scales (two counts and a percentage),
 * so they are three small charts sharing an x-axis, never one chart with two
 * y-axes.
 */
export default function TeamPerformancePanel({ teamId }: { teamId: string }) {
  const [data, setData] = useState<ApiTeamPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    apiGetTeamPerformance(teamId, WEEKS)
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [teamId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin text-gray-500" />
      </div>
    );
  }
  if (failed || !data) {
    return <p className="text-gray-500 text-sm">Couldn&apos;t load this team&apos;s recent activity.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <CurrentChip label="Open tasks" value={data.openTasks} />
        <CurrentChip label="Needs resubmit" value={data.tasksNeedingResubmit} warn={data.tasksNeedingResubmit > 0} />
        <CurrentChip label="Students" value={data.memberCount} />
      </div>

      <div className="space-y-3">
        <TrendChart
          title="Tasks approved"
          weeks={data.weeks}
          valueOf={(w) => w.tasksApproved}
          format={(v) => String(v)}
        />
        <TrendChart
          title="Sessions held"
          weeks={data.weeks}
          valueOf={(w) => w.sessionsHeld}
          format={(v) => String(v)}
        />
        <TrendChart
          title="Attendance"
          weeks={data.weeks}
          // Null, not 0, when nothing was marked — an unmarked week is missing
          // data, and drawing it as 0% would read as everyone being absent.
          valueOf={(w) => (w.attendanceMarked === 0 ? null : Math.round((w.attendancePresent / w.attendanceMarked) * 100))}
          format={(v) => `${v}%`}
          max={100}
        />
      </div>

      <p className="text-[11px] text-gray-500">
        Last {WEEKS} weeks, Monday to Sunday. The final bar is the current week and is still filling up; a flat
        line means nothing happened that week, and a grey tick on Attendance means nothing was marked.
      </p>
    </div>
  );
}

function CurrentChip({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 text-xs px-2.5 py-1 rounded-lg border ${
        warn ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 'bg-zinc-800 text-gray-300 border-zinc-700'
      }`}
    >
      <span className="font-bold text-sm">{value}</span>
      {label}
    </span>
  );
}

interface TrendChartProps {
  title: string;
  weeks: ApiTeamPerformanceWeek[];
  valueOf: (week: ApiTeamPerformanceWeek) => number | null;
  format: (value: number) => string;
  /** Fixed axis top, for measures like a percentage whose scale is known. */
  max?: number;
}

function TrendChart({ title, weeks, valueOf, format, max }: TrendChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  const values = useMemo(() => weeks.map(valueOf), [weeks, valueOf]);
  const scaleTop = useMemo(() => {
    if (max !== undefined) return max;
    const highest = Math.max(...values.map((v) => v ?? 0));
    return highest > 0 ? highest : 1;
  }, [values, max]);

  const latest = values[values.length - 1];
  const previous = values[values.length - 2];
  const delta = latest !== null && latest !== undefined && previous !== null && previous !== undefined
    ? latest - previous
    : null;

  return (
    <div className="bg-zinc-900 border border-zinc-750 rounded-lg p-3">
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

      {/* Every bar sits on one shared baseline, so a zero week reads as a gap
          against the line rather than as a missing bar. The last bar is the
          current, still-incomplete week and is the only one at full strength. */}
      <div
        className="flex items-end gap-[2px] h-12 border-b border-zinc-750"
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
              {/* Three distinct states, deliberately not collapsed into two:
                  a real value, a real zero, and a week nothing was recorded
                  for. Drawing "no data" as a bar of any height would claim a
                  measurement that was never taken. */}
              {value === null ? (
                <div className="w-full h-[3px] rounded-full bg-zinc-750" title="not recorded" />
              ) : value === 0 ? (
                <div className="w-full h-[3px] rounded-full bg-zinc-700" />
              ) : (
                <div
                  className={`w-full rounded-t ${isLatest ? 'bg-gold' : 'bg-gold/40'}`}
                  style={{ height: `${Math.max(8, (value / scaleTop) * 100)}%` }}
                />
              )}

              {hovered === i && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-10 whitespace-nowrap px-2 py-1 rounded-md bg-zinc-800 border border-zinc-700 text-[11px] text-gray-200 shadow-lg pointer-events-none">
                  <span className="text-gray-400">{weekLabel(week.weekStart)}</span>{' · '}
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
function DeltaBadge({ delta, format }: { delta: number | null; format: (value: number) => string }) {
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

function weekLabel(weekStartIso: string): string {
  const start = new Date(weekStartIso);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  return `${fmt(start)} – ${fmt(end)}`;
}
