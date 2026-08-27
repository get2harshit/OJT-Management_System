import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import WeeklyTrendChart, { TREND_MEASURES } from './WeeklyTrendChart';
import { apiGetTeamPerformance, type ApiTeamPerformance } from '../lib/api/teamRoster';

const WEEKS = 8;

/**
 * One team's last few weeks, for a view that is looking at exactly that team.
 *
 * The mentor's own roster screen does NOT use this — it reads every team in
 * one call instead, because calling this once per team is an N+1. This stays
 * for the single-team case, where one request is the right number.
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
        {TREND_MEASURES.map((measure) => (
          <WeeklyTrendChart key={measure.title} weeks={data.weeks} {...measure} />
        ))}
      </div>

      <p className="text-[11px] text-gray-500">
        Last {WEEKS} weeks, Monday to Sunday. The final bar is the current week and is still filling up; a flat line
        means nothing happened that week, and a grey tick on Attendance means nothing was marked.
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
