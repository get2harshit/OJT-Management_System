import { useState, useEffect, useCallback } from 'react';
import { Users, GraduationCap, Layers, CalendarClock, FolderOpen, CheckSquare, Route } from 'lucide-react';
import StatCard from '../../components/StatCard';
import Select from '../../components/Select';
import SpinnerSquare from '../../components/SpinnerSquare';
import OjtWeekBadge from '../../components/OjtWeekBadge';
import type { Cohort } from '../../lib/types';
import { apiListMyCohorts } from '../../lib/api';
import { apiGetMyOjtOverview, type ApiMentorOjtOverview } from '../../lib/api/teamRoster';
import { buildCohortOptions } from '../../lib/cohortLabel';
import { useAuth } from '../../context/useAuth';
import { usePageRefresh } from '../../context/RefreshContext';

interface Props {
  mentorId: string;
  onNavigateToSection: (tab: string) => void;
}

/**
 * The mentor's headline view of one OJT.
 *
 * Every figure comes from a single aggregate read. The previous version
 * fetched every student and every submission in the system and filtered them
 * in the browser to find this mentor's own — over-fetching of exactly the
 * kind this codebase forbids, and it grew with the institution rather than
 * with the mentor's roster.
 */
export default function MentorDashboard({
  onNavigateToSection,
}: Partial<Props> & Pick<Props, 'mentorId' | 'onNavigateToSection'>) {
  const { user } = useAuth();
  const mentorName = user?.fullName || (user?.email ? user.email.split('@')[0] : 'Mentor');

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortId, setCohortId] = useState('');
  const [overview, setOverview] = useState<ApiMentorOjtOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiListMyCohorts()
      .then(setCohorts)
      .catch(() => setCohorts([]));
  }, []);

  // Defaults to the running OJT, but never overwrites a manual pick — the
  // same resolution every other cohort-scoped screen in this app uses.
  useEffect(() => {
    if (cohorts.length === 0) {
      setLoading(false);
      return;
    }
    setCohortId((prev) => prev || cohorts.find((c) => c.isActive)?.id || cohorts[0]?.id || prev);
  }, [cohorts]);

  const load = useCallback(() => {
    if (!cohortId) return Promise.resolve();
    setLoading(true);
    setFailed(false);
    return apiGetMyOjtOverview(cohortId)
      .then(setOverview)
      .catch(() => {
        setOverview(null);
        setFailed(true);
      })
      .finally(() => setLoading(false));
  }, [cohortId]);

  useEffect(() => {
    load();
  }, [load]);

  usePageRefresh(load);

  const selectedCohort = cohorts.find((c) => c.id === cohortId) ?? null;

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      <div className="bg-zinc-850 border border-zinc-750 p-6 rounded-2xl shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Welcome back, <span className="text-gold">{mentorName}</span> 👋
              </h1>
              <OjtWeekBadge startDate={selectedCohort?.startDate} endDate={selectedCohort?.endDate} />
            </div>
            <p className="text-gray-400 text-sm mt-1">Your teams, sessions and reviews in this OJT.</p>
          </div>
          <Select
            variant="filter"
            className="min-w-[220px]"
            value={cohortId}
            onChange={setCohortId}
            placeholder="Select OJT"
            options={buildCohortOptions(cohorts)}
          />
        </div>
      </div>

      {loading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : !cohortId ? (
        <EmptyState message="You're not part of an active OJT yet." />
      ) : failed || !overview ? (
        <EmptyState message="Couldn't load this OJT's numbers. Try refreshing." />
      ) : (
        <>
          <TracksStrip tracks={overview.tracks} />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6">
            <StatCard title="My Teams" value={overview.teamCount} icon={Users} onClick={() => onNavigateToSection('ojts')} />
            <StatCard title="My Students" value={overview.studentCount} icon={GraduationCap} onClick={() => onNavigateToSection('ojts')} />
            <StatCard title="Groups" value={overview.groupCount} icon={Layers} onClick={() => onNavigateToSection('ojts')} />
            <StatCard title="Sessions" value={overview.sessions.total} icon={CalendarClock} onClick={() => onNavigateToSection('sessions')} />
            <StatCard title="Pending Reviews" value={overview.submissionsPending} icon={FolderOpen} onClick={() => onNavigateToSection('submissions')} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <TaskCompletionCard approved={overview.tasksApproved} total={overview.tasksTotal} />
            <SessionBreakdownCard sessions={overview.sessions} />
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-10 text-center">
      <p className="text-gray-400 text-sm">{message}</p>
    </div>
  );
}

/**
 * The tracks this mentor covers in this OJT.
 *
 * A track can appear here two ways — an admin staffed them on it, or a team
 * on it was reassigned to them — and the two genuinely disagree in live data.
 * Both are shown, labelled, rather than one source quietly winning.
 */
function TracksStrip({ tracks }: { tracks: ApiMentorOjtOverview['tracks'] }) {
  if (tracks.length === 0) return null;
  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
      <h2 className="text-base font-semibold text-white flex items-center gap-2 mb-3">
        <Route size={17} className="text-gold" />
        Tracks you&apos;re mentoring
      </h2>
      <div className="flex flex-wrap gap-2">
        {tracks.map((track) => (
          <span
            key={track.id}
            className="inline-flex items-baseline gap-2 text-xs px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-750"
            title={track.staffed ? 'You are staffed on this track for this OJT' : 'A team on this track reports to you, though you were not staffed on it'}
          >
            <span className="text-white font-medium">{track.name}</span>
            <span className="text-gray-400 tabular-nums">
              {track.teamCount} {track.teamCount === 1 ? 'team' : 'teams'}
            </span>
            {!track.staffed && (
              <span className="text-[10px] uppercase tracking-wide text-gray-500">not staffed</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Task progress, always with its denominator visible — "100%" over two
 * assignments and over two hundred are very different facts, and a bare
 * percentage hides which one you're looking at.
 */
function TaskCompletionCard({ approved, total }: { approved: number; total: number }) {
  const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <CheckSquare size={17} className="text-gold" />
          Task completion
        </h3>
        <span className="text-sm text-gray-300 tabular-nums">
          {approved}<span className="text-gray-500">/{total}</span>
          {total > 0 && <span className="text-gray-400"> · {pct}%</span>}
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-3">Approved assignments across your students in this OJT.</p>
      {total === 0 ? (
        <p className="text-sm text-gray-500">No task assignments in this OJT yet.</p>
      ) : (
        <div className="h-2 bg-zinc-750 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-gold transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

// Status carries an icon-free label and a number, never colour alone — the
// four states have to survive greyscale and colour-blindness.
const SESSION_STATES: { key: 'scheduled' | 'completed' | 'rescheduled' | 'cancelled'; label: string; barClass: string }[] = [
  { key: 'completed', label: 'Completed', barClass: 'bg-green-500' },
  { key: 'scheduled', label: 'Scheduled', barClass: 'bg-gold' },
  { key: 'rescheduled', label: 'Rescheduled', barClass: 'bg-yellow-500' },
  { key: 'cancelled', label: 'Cancelled', barClass: 'bg-red-500' },
];

function SessionBreakdownCard({ sessions }: { sessions: ApiMentorOjtOverview['sessions'] }) {
  const { total } = sessions;
  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <CalendarClock size={17} className="text-gold" />
          Sessions
        </h3>
        <span className="text-sm text-gray-300 tabular-nums">{total} total</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">Sessions you host in this OJT, by status.</p>
      {total === 0 ? (
        <p className="text-sm text-gray-500">No sessions scheduled in this OJT yet.</p>
      ) : (
        <div className="space-y-3">
          {SESSION_STATES.map(({ key, label, barClass }) => {
            const count = sessions[key];
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={key}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-300">{label}</span>
                  <span className="text-gray-400 tabular-nums">{count} ({pct}%)</span>
                </div>
                <div className="h-2 bg-zinc-750 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${barClass}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
