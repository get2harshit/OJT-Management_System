import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, FileText, Inbox } from 'lucide-react';
import SpinnerSquare from './SpinnerSquare';
import { apiGetCohortProgress, type CohortProgress } from '../lib/api/dashboard';

// In the order a student actually moves through them, so the bar reads left to
// right as progress rather than as an arbitrary breakdown. Colours match the
// Allocation Blueprint's stage dots — same stages, same meaning, same colours.
const STAGES: { key: keyof CohortProgress['funnel']; label: string; bar: string; text: string }[] = [
  { key: 'no_team', label: 'No team yet', bar: 'bg-red-400', text: 'text-red-400' },
  { key: 'team_no_preferences', label: 'Team, no project', bar: 'bg-gray-400', text: 'text-gray-400' },
  { key: 'preferences_pending_allocation', label: 'Awaiting allocation', bar: 'bg-yellow-500', text: 'text-yellow-500' },
  { key: 'allocated_not_published', label: 'Allocated, unpublished', bar: 'bg-blue-400', text: 'text-blue-400' },
  { key: 'allocated_published', label: 'Published', bar: 'bg-green-500', text: 'text-green-500' },
];

/**
 * Where this OJT has got to, and what is holding it up.
 *
 * Replaces two panels that were drawn from mock data kept in the browser's
 * localStorage — a submission breakdown and an "activity feed" that were never
 * wired to a backend, and so showed the same invented rows on every install and
 * for every cohort. Anyone reading them was reading fiction.
 *
 * Split into where students are, what is blocking them, and whether the weekly
 * work is happening, because those are three different questions with three
 * different people acting on them. Every number links to the screen where it
 * can be acted on: a count nobody can do anything about is decoration.
 */
export default function CohortProgressPanel({ cohortId }: { cohortId: string }) {
  const navigate = useNavigate();
  const [progress, setProgress] = useState<CohortProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!cohortId) return;
    setLoading(true);
    setError('');
    apiGetCohortProgress(cohortId)
      .then(setProgress)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load progress'))
      .finally(() => setLoading(false));
  }, [cohortId]);

  if (loading) {
    return (
      <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5 flex justify-center py-12">
        <SpinnerSquare />
      </div>
    );
  }

  if (error || !progress) {
    return (
      <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
        <p className="text-sm text-gray-500">{error || 'No progress data for this OJT.'}</p>
      </div>
    );
  }

  const totalStudents = STAGES.reduce((sum, stage) => sum + progress.funnel[stage.key], 0);
  const published = progress.funnel.allocated_published;
  const percentPublished = totalStudents ? Math.round((published / totalStudents) * 100) : 0;

  const blockers = [
    {
      label: 'Project proposals awaiting review',
      value: progress.blockers.projectsPendingReview,
      icon: FileText,
      // These block their own teams' allocation, which is why they sit first.
      hint: 'Blocks allocation for these teams',
      to: `/admin/dashboard/ojts/${cohortId}/projects`,
    },
    {
      label: 'Teams allocation could not resolve',
      value: progress.blockers.teamsNeedingReview,
      icon: AlertTriangle,
      hint: 'Needs a manual decision',
      to: `/admin/dashboard/ojts/${cohortId}/allocations`,
    },
    {
      label: 'Session requests undecided',
      value: progress.blockers.sessionRequestsPending,
      icon: Inbox,
      hint: 'Mentors waiting on an answer',
      to: `/admin/dashboard/session-requests?cohortId=${cohortId}`,
    },
  ];

  const delivery = [
    { label: 'Sessions in the next 7 days', value: progress.delivery.sessionsScheduledNext7Days, icon: CalendarClock, to: `/admin/dashboard/ojts/${cohortId}/sessions` },
    { label: 'Sessions completed in the last 7', value: progress.delivery.sessionsCompletedLast7Days, icon: CheckCircle2, to: `/admin/dashboard/ojts/${cohortId}/sessions` },
    { label: 'Past sessions still unmarked', value: progress.delivery.sessionsAwaitingAttendance, icon: ClipboardList, to: `/admin/dashboard/ojts/${cohortId}/attendance` },
    { label: 'Submissions awaiting review', value: progress.delivery.submissionsPendingReview, icon: FileText, to: `/admin/dashboard/ojts/${cohortId}/submissions` },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5 space-y-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h3 className="text-lg font-semibold text-white">Where students are</h3>
          <button
            onClick={() => navigate(`/admin/dashboard/ojts/${cohortId}/blueprint`)}
            className="text-xs text-gold hover:underline"
          >
            Open blueprint
          </button>
        </div>

        {totalStudents === 0 ? (
          <p className="text-sm text-gray-500">No students enrolled on this OJT yet.</p>
        ) : (
          <>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white tabular-nums">{percentPublished}%</span>
                <span className="text-sm text-gray-400">
                  published — {published} of {totalStudents} students
                </span>
              </div>
              {/* One bar, segmented, rather than five separate bars: the point
                  is what share of the cohort sits at each stage, and separate
                  bars make that a comparison the reader has to do themselves. */}
              <div className="mt-3 h-2.5 rounded-full overflow-hidden flex bg-zinc-750">
                {STAGES.map((stage) => {
                  const count = progress.funnel[stage.key];
                  if (count === 0) return null;
                  return (
                    <div
                      key={stage.key}
                      className={stage.bar}
                      style={{ width: `${(count / totalStudents) * 100}%` }}
                      title={`${stage.label}: ${count}`}
                    />
                  );
                })}
              </div>
            </div>

            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {STAGES.map((stage) => (
                <li key={stage.key}>
                  <div className={`text-lg font-bold tabular-nums ${stage.text}`}>{progress.funnel[stage.key]}</div>
                  <div className="text-xs text-gray-500 leading-tight">{stage.label}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
          <h3 className="text-lg font-semibold text-white mb-4">What’s holding it up</h3>
          {blockers.every((b) => b.value === 0) ? (
            <p className="text-sm text-gray-500">Nothing is blocked right now.</p>
          ) : (
            <ul className="space-y-2">
              {blockers.map((blocker) => (
                <li key={blocker.label}>
                  <button
                    onClick={() => navigate(blocker.to)}
                    className="w-full flex items-center gap-3 text-left px-3 py-2 rounded-lg hover:bg-zinc-800 transition-colors"
                  >
                    <blocker.icon size={15} className={blocker.value > 0 ? 'text-amber-400 shrink-0' : 'text-gray-600 shrink-0'} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-gray-300 truncate">{blocker.label}</span>
                      {blocker.value > 0 && <span className="block text-xs text-gray-500">{blocker.hint}</span>}
                    </span>
                    <span className={`text-lg font-bold tabular-nums shrink-0 ${blocker.value > 0 ? 'text-amber-400' : 'text-gray-600'}`}>
                      {blocker.value}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
          <h3 className="text-lg font-semibold text-white mb-4">This week’s work</h3>
          <ul className="space-y-2">
            {delivery.map((item) => (
              <li key={item.label}>
                <button
                  onClick={() => navigate(item.to)}
                  className="w-full flex items-center gap-3 text-left px-3 py-2 rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  <item.icon size={15} className="text-gold shrink-0" />
                  <span className="flex-1 min-w-0 text-sm text-gray-300 truncate">{item.label}</span>
                  <span className="text-lg font-bold text-white tabular-nums shrink-0">{item.value}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
