import { useState, useEffect, useCallback } from 'react';
import { ClipboardList, CheckCircle2, XCircle, CalendarClock, Users, Timer, RefreshCw } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import DataTable from '../../components/DataTable';
import Select from '../../components/Select';
import SpinnerSquare from '../../components/SpinnerSquare';
import {
  apiGetMySessions,
  apiGetMySessionStats,
  apiListMyCohorts,
  type ApiSession,
  type ApiMentorSessionStats,
} from '../../lib/api';
import type { Cohort } from '../../lib/types';
import { buildCohortOptions } from '../../lib/cohortLabel';
import { formatInIST } from '../../lib/utils';
import { usePageRefresh } from '../../context/RefreshContext';
import { useToast } from '../../toast';

/**
 * A mentor's record of work delivered — sessions held, hours, teams mentored.
 *
 * Deliberately carries no rate, amount or payment status. Final billing is
 * settled outside this platform from the admin-side export, so showing a
 * mentor a money figure here would be a number they can't act on and that
 * isn't the source of truth anyway.
 *
 * Sourced from sessions rather than payout rows on purpose: a payout row only
 * exists once an admin has set that mentor's rate, so a rate-less mentor
 * would otherwise see an empty page despite having taught all term.
 */
export default function MentorWorkSummary() {
  const { showError } = useToast();

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortId, setCohortId] = useState('');
  const [stats, setStats] = useState<ApiMentorSessionStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [listLoading, setListLoading] = useState(true);

  const loadCohorts = useCallback(
    () =>
      apiListMyCohorts()
        .then((list) => setCohorts(list || []))
        .catch(() => setCohorts([])),
    []
  );

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      setStats(await apiGetMySessionStats(cohortId || undefined));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load your session summary');
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [cohortId, showError]);

  const loadSessions = useCallback(
    async (page = 1, limit = 20) => {
      setListLoading(true);
      try {
        const res = await apiGetMySessions({ cohortId: cohortId || undefined, status: 'completed', page, limit });
        setSessions(res.data);
        setPagination(res.pagination);
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to load your delivered sessions');
      } finally {
        setListLoading(false);
      }
    },
    [cohortId, showError]
  );

  useEffect(() => {
    loadCohorts();
  }, [loadCohorts]);

  useEffect(() => {
    loadStats();
    loadSessions(1, pagination.limit);
    // pagination.limit is intentionally not a dependency — changing the page
    // size calls loadSessions directly rather than re-running this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohortId]);

  usePageRefresh(
    useCallback(() => Promise.all([loadCohorts(), loadStats(), loadSessions(1, pagination.limit)]), [
      loadCohorts,
      loadStats,
      loadSessions,
      pagination.limit,
    ])
  );

  return (
    <PageLayout mode="fill" className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ClipboardList size={24} className="text-gold" />
            My Work Summary
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Everything you&apos;ve delivered — sessions held, hours, and the teams you mentored.
          </p>
        </div>
        <Select
          value={cohortId}
          onChange={setCohortId}
          variant="filter"
          className="w-[220px]"
          placeholder="All OJTs"
          options={buildCohortOptions(cohorts)}
        />
      </div>

      {statsLoading ? (
        <div className="min-h-[20vh] flex items-center justify-center">
          <SpinnerSquare size={40} />
        </div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <SummaryTile
              icon={CheckCircle2}
              label="Sessions delivered"
              value={stats.completed}
              tone="text-green-400"
            />
            <SummaryTile
              icon={Timer}
              label="Hours delivered"
              value={formatHours(stats.deliveredMinutes)}
              tone="text-gold"
            />
            <SummaryTile icon={Users} label="Teams mentored" value={stats.teamsMentored} tone="text-white" />
          </div>

          <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
            <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-3">
              All sessions {cohortId ? 'in this OJT' : 'across your OJTs'}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <BreakdownCell icon={CalendarClock} label="Scheduled" value={stats.scheduled} tone="text-blue-400" />
              <BreakdownCell icon={RefreshCw} label="Rescheduled" value={stats.rescheduled} tone="text-yellow-400" />
              <BreakdownCell icon={CheckCircle2} label="Completed" value={stats.completed} tone="text-green-400" />
              <BreakdownCell icon={XCircle} label="Cancelled" value={stats.cancelled} tone="text-red-400" />
            </div>
          </div>
        </>
      ) : null}

      <DataTable
        columns={[
          { key: 'when', header: 'Session', render: (row) => formatSessionWhen(row) },
          { key: 'title', header: 'Title', render: (row) => row.title || row.kind_label },
          { key: 'teams', header: 'Teams', render: (row) => teamNames(row) },
          { key: 'duration', header: 'Duration', render: (row) => formatDuration(row) },
        ]}
        data={sessions.map((s) => ({ ...s, when: formatSessionWhen(s) }))}
        searchPlaceholder="Search delivered sessions..."
        loading={listLoading}
        exportFilename="my-delivered-sessions"
        serverPagination={{
          page: pagination.page,
          limit: pagination.limit,
          totalPages: pagination.totalPages,
          total: pagination.total,
          onPageChange: (page) => loadSessions(page, pagination.limit),
          onLimitChange: (limit) => loadSessions(1, limit),
        }}
      />
    </PageLayout>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4">
      <div className="flex items-center gap-2 text-gray-400">
        <Icon size={15} />
        <p className="text-xs uppercase tracking-wider font-bold">{label}</p>
      </div>
      <p className={`text-3xl font-bold mt-2 ${tone}`}>{value}</p>
    </div>
  );
}

function BreakdownCell({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-gray-400">
        <Icon size={13} />
        <p className="text-[11px] uppercase tracking-wide font-semibold">{label}</p>
      </div>
      <p className={`text-xl font-bold mt-1 ${tone}`}>{value}</p>
    </div>
  );
}

function formatHours(minutes: number): string {
  if (minutes <= 0) return '0';
  const hours = minutes / 60;
  // Whole hours read better than "12.0" for the common case.
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

function formatSessionWhen(session: ApiSession): string {
  const date = formatInIST(session.start_time, { day: '2-digit', month: 'short', year: 'numeric' });
  const time = formatInIST(session.start_time, { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

function formatDuration(session: ApiSession): string {
  const minutes = session.actual_duration_minutes ?? session.duration_minutes;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
}

function teamNames(session: ApiSession): string {
  if (session.teams.length === 0) return '—';
  return session.teams.map((t) => t.team.name).join(', ');
}
