import { useCallback, useEffect, useState } from 'react';
import { CalendarX2, RefreshCw } from 'lucide-react';
import {
  apiListCalendarSyncIssues,
  apiRetryCalendarSync,
  apiRetryAllCalendarSyncs,
  type ApiCalendarSyncIssue,
} from '../lib/api/sessions';
import { useToast } from '../toast';

interface CalendarSyncIssuesPanelProps {
  /** Scopes the list to one OJT. Omit for every OJT. */
  cohortId?: string;
}

/**
 * Sessions that were scheduled but never made it onto the operations Google
 * Calendar, with a way to re-run them.
 *
 * This exists because booking is deliberately not part of saving a session —
 * Google being unreachable must never stop anyone from scheduling. The cost of
 * that choice is that a failure is invisible unless something surfaces it,
 * which is this panel's whole job.
 *
 * Renders nothing when there is nothing wrong, so it stays out of the way on
 * the many days when every booking worked.
 */
export default function CalendarSyncIssuesPanel({ cohortId }: CalendarSyncIssuesPanelProps) {
  const { showSuccess, showError } = useToast();
  const [issues, setIssues] = useState<ApiCalendarSyncIssue[] | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);

  const fetchIssues = useCallback(async () => {
    try {
      setIssues(await apiListCalendarSyncIssues(cohortId));
    } catch {
      // A panel that only appears when something is wrong must not itself
      // become the thing that is wrong — an admin without access, or a backend
      // that predates this endpoint, simply sees no panel.
      setIssues([]);
    }
  }, [cohortId]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  const handleRetry = async (issue: ApiCalendarSyncIssue) => {
    setRetryingId(issue.sessionId);
    try {
      const result = await apiRetryCalendarSync(issue.sessionId);
      if (result.status === 'synced') showSuccess('Booked on the calendar');
      else if (result.status === 'skipped') showError('No operations calendar is configured in this environment');
      else showError(result.error || 'Still failing');
      await fetchIssues();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not retry');
    } finally {
      setRetryingId(null);
    }
  };

  const handleRetryAll = async () => {
    setRetryingAll(true);
    try {
      const { attempted, remaining } = await apiRetryAllCalendarSyncs(cohortId);
      if (remaining === 0) showSuccess(`Booked all ${attempted}`);
      else showError(`Retried ${attempted}, ${remaining} still failing`);
      await fetchIssues();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not retry');
    } finally {
      setRetryingAll(false);
    }
  };

  if (issues === null || issues.length === 0) return null;

  return (
    <section className="bg-zinc-850 border border-amber-500/25 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2">
          <CalendarX2 size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-white">
              {issues.length} session{issues.length === 1 ? '' : 's'} not on the calendar
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              These are scheduled in the portal, but their calendar invite never went out. Everything else about
              them works normally.
            </p>
          </div>
        </div>
        <button
          onClick={handleRetryAll}
          disabled={retryingAll}
          className="flex items-center gap-1.5 shrink-0 px-3 py-1.5 text-sm rounded-md border border-zinc-700 text-gray-300 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={14} className={retryingAll ? 'animate-spin' : ''} />
          {retryingAll ? 'Retrying...' : 'Retry all'}
        </button>
      </div>

      <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
        {issues.map((issue) => (
          <div
            key={issue.sessionId}
            className="flex items-start justify-between gap-3 bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-sm text-white truncate">
                {issue.title || 'Untitled session'}
                <span className="text-gray-500"> · {new Date(issue.startTime).toLocaleString()}</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {issue.mentorName ?? 'Unknown mentor'}
                {issue.cohortName ? ` · ${issue.cohortName}` : ''}
                {issue.attempts > 1 ? ` · ${issue.attempts} attempts` : ''}
              </p>
              {issue.error && (
                <p className="text-xs text-amber-400/80 mt-1 break-words" title={issue.error}>
                  {issue.error}
                </p>
              )}
            </div>
            <button
              onClick={() => handleRetry(issue)}
              disabled={retryingId === issue.sessionId}
              className="flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 text-xs rounded-md border border-zinc-700 text-gray-300 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={12} className={retryingId === issue.sessionId ? 'animate-spin' : ''} />
              Retry
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
