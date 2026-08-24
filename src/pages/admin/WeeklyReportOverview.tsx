import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, ChevronDown, ChevronRight, Loader2, Search } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import Button from '../../components/Button';
import Select from '../../components/Select';
import WeeklyReportGrid, { WeeklyReportSummaryStrip } from '../../components/WeeklyReportGrid';
import { apiApproveTask, apiGetAllWeeklyReports, apiRequestResubmit } from '../../lib/api/tasks';
import type { ApiAllWeeklyReports, ApiAssignmentStatus } from '../../lib/api/tasks';
import { useToast } from '../../toast';

const STATUS_LABEL: Record<ApiAssignmentStatus, string> = {
  pending: 'Not started',
  review: 'Submitted',
  resubmit: 'Sent back',
  approved: 'Approved',
};

const STATUS_TONE: Record<ApiAssignmentStatus, string> = {
  pending: 'bg-zinc-800 text-gray-400 border-zinc-700',
  review: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
  resubmit: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
  approved: 'bg-green-500/10 text-green-400 border-green-500/25',
};

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Not started' },
  { value: 'review', label: 'Submitted' },
  { value: 'resubmit', label: 'Sent back' },
  { value: 'approved', label: 'Approved' },
];

/**
 * Every mentor's weekly report for one week, in one place.
 *
 * The whole task is one response — one week's reports across a cohort is a
 * bounded amount of data the backend already assembles in a handful of
 * queries, so the search and status filters here run over what is already
 * loaded rather than round-tripping. Nothing is paginated away: the point of
 * this screen is seeing the week whole.
 */
export default function WeeklyReportOverview() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();

  const [data, setData] = useState<ApiAllWeeklyReports | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Which mentor's row is mid-action, so only that one's buttons spin.
  const [acting, setActing] = useState<string | null>(null);
  // Sending a report back needs a reason — the mentor has to know what to
  // change. Kept per mentor so opening a second one doesn't inherit the
  // first's half-typed note.
  const [resubmitFor, setResubmitFor] = useState<string | null>(null);
  const [resubmitComment, setResubmitComment] = useState('');

  const load = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    setLoadError(null);
    try {
      setData(await apiGetAllWeeklyReports(taskId));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load these reports');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  const mentors = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.mentors ?? []).filter((mentor) => {
      if (statusFilter && mentor.status !== statusFilter) return false;
      if (!term) return true;
      // Matching on team names too, because "which mentor has G3" is the
      // question an admin actually arrives with.
      return (
        mentor.mentorName.toLowerCase().includes(term) ||
        mentor.teams.some((t) => t.teamName.toLowerCase().includes(term))
      );
    });
  }, [data, search, statusFilter]);

  const submittedCount = useMemo(
    () => (data?.mentors ?? []).filter((m) => m.status === 'review' || m.status === 'approved').length,
    [data]
  );

  const handleApprove = async (assignmentId: string) => {
    if (!taskId) return;
    setActing(assignmentId);
    try {
      await apiApproveTask(taskId, assignmentId);
      showSuccess('Report approved');
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not approve that report');
    } finally {
      setActing(null);
    }
  };

  const handleResubmit = async (assignmentId: string) => {
    if (!taskId || !resubmitComment.trim()) return;
    setActing(assignmentId);
    try {
      await apiRequestResubmit(taskId, assignmentId, resubmitComment.trim());
      showSuccess('Sent back to the mentor');
      setResubmitFor(null);
      setResubmitComment('');
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not send that report back');
    } finally {
      setActing(null);
    }
  };

  const toggle = (assignmentId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(assignmentId)) next.delete(assignmentId);
      else next.add(assignmentId);
      return next;
    });
  };

  if (loading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center flex-1 text-gray-500 gap-2">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading reports&hellip;</span>
        </div>
      </PageLayout>
    );
  }

  if (loadError || !data) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center flex-1 gap-3">
          <p className="text-sm text-gray-400">{loadError ?? 'Report not found'}</p>
          <Button variant="secondary" size="sm" onClick={() => navigate('/admin/dashboard/tasks')}>
            Back to tasks
          </Button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout mode="scroll" className="space-y-5">
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => navigate('/admin/dashboard/tasks')}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          <ArrowLeft size={13} /> Tasks
        </button>
        <h1 className="text-xl font-semibold text-white">{data.task.title}</h1>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="text-gold font-medium">{data.task.week}</span>
          <span className="flex items-center gap-1">
            <Calendar size={12} />
            Due {new Date(data.task.deadline).toLocaleDateString()}
          </span>
          <span>
            {submittedCount} of {data.mentors.length} mentors submitted
          </span>
        </div>
      </div>

      <WeeklyReportSummaryStrip summary={data.summary} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search mentor or team"
            className="w-full bg-zinc-850 border border-zinc-750 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-gold transition-colors placeholder-gray-500"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_FILTER_OPTIONS}
          variant="filter"
          className="w-44"
        />
      </div>

      {mentors.length === 0 ? (
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-400">
            {data.mentors.length === 0 ? 'This report has not been sent to any mentor.' : 'No mentor matches those filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {mentors.map((mentor) => {
            const isOpen = expanded.has(mentor.assignmentId);
            return (
              <div key={mentor.assignmentId} className="bg-zinc-850 border border-zinc-750 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(mentor.assignmentId)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800/50 transition-colors"
                >
                  {isOpen ? (
                    <ChevronDown size={16} className="text-gray-500 shrink-0" />
                  ) : (
                    <ChevronRight size={16} className="text-gray-500 shrink-0" />
                  )}
                  <span className="text-sm font-medium text-white flex-1 truncate">{mentor.mentorName}</span>
                  {/* filled/total, not just the workflow status — a mentor
                      can submit a half-empty grid, and that difference is
                      the thing an admin needs to see at a glance. */}
                  <span
                    className={`text-xs tabular-nums ${
                      mentor.filledTeams < mentor.teamCount ? 'text-amber-400' : 'text-gray-400'
                    }`}
                  >
                    {mentor.filledTeams}/{mentor.teamCount} teams
                  </span>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                      STATUS_TONE[mentor.status]
                    }`}
                  >
                    {STATUS_LABEL[mentor.status]}
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-zinc-750 p-3 space-y-3">
                    <WeeklyReportGrid teams={mentor.teams} readOnly />

                    {/* Acting on the report belongs here, next to the grid
                        the decision is made from — the generic Review
                        Assignments panel hands off to the Submissions tab,
                        which has nothing to show for a report. */}
                    {mentor.status === 'review' && (
                      <div className="flex flex-wrap items-start gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(mentor.assignmentId)}
                          isLoading={acting === mentor.assignmentId && resubmitFor !== mentor.assignmentId}
                          disabled={acting !== null}
                        >
                          Approve
                        </Button>
                        {resubmitFor === mentor.assignmentId ? (
                          <div className="flex-1 min-w-[260px] flex flex-wrap items-start gap-2">
                            <textarea
                              value={resubmitComment}
                              onChange={(e) => setResubmitComment(e.target.value)}
                              rows={2}
                              autoFocus
                              placeholder="What does the mentor need to change?"
                              className="flex-1 min-w-[220px] bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-gold transition-colors resize-none placeholder-gray-600"
                            />
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleResubmit(mentor.assignmentId)}
                              isLoading={acting === mentor.assignmentId}
                              disabled={acting !== null || !resubmitComment.trim()}
                            >
                              Send back
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setResubmitFor(null); setResubmitComment(''); }}
                              disabled={acting !== null}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => { setResubmitFor(mentor.assignmentId); setResubmitComment(''); }}
                            disabled={acting !== null}
                          >
                            Resubmit
                          </Button>
                        )}
                      </div>
                    )}

                    {mentor.status === 'pending' && (
                      <p className="text-[11px] text-gray-500">This mentor has not submitted their report yet.</p>
                    )}
                    {mentor.status === 'resubmit' && (
                      <p className="text-[11px] text-amber-400">Sent back — waiting for the mentor to resubmit.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PageLayout>
  );
}
