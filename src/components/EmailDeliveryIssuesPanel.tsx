import { useCallback, useEffect, useState } from 'react';
import { MailX, RefreshCw } from 'lucide-react';
import {
  apiListEmailDeliveryIssues,
  apiRetryEmailDelivery,
  apiRetryAllEmailDeliveries,
  type ApiEmailDeliveryIssue,
} from '../lib/api/notifications';
import { useToast } from '../toast';

/**
 * Notifications that were delivered in the portal but whose email never went
 * out, with a way to re-send them.
 *
 * This exists because sending is deliberately not part of saving a
 * notification — SendGrid being unreachable must never stop a submission from
 * being returned or a session from being cancelled. The cost of that choice is
 * that a failure is invisible unless something surfaces it, which is this
 * panel's whole job.
 *
 * These failures usually arrive in a batch and share one cause (an unverified
 * sender, an expired key), which is why "Retry all" is the primary action
 * rather than an afterthought.
 *
 * Renders nothing when there is nothing wrong, so it stays out of the way on
 * the many days when every email went out.
 */
export default function EmailDeliveryIssuesPanel() {
  const { showSuccess, showError } = useToast();
  const [issues, setIssues] = useState<ApiEmailDeliveryIssue[] | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);

  const fetchIssues = useCallback(async () => {
    try {
      setIssues(await apiListEmailDeliveryIssues());
    } catch {
      // A panel that only appears when something is wrong must not itself
      // become the thing that is wrong — an admin without access, or a backend
      // that predates this endpoint, simply sees no panel.
      setIssues([]);
    }
  }, []);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  const handleRetry = async (issue: ApiEmailDeliveryIssue) => {
    setRetryingId(issue.notificationId);
    try {
      const result = await apiRetryEmailDelivery(issue.notificationId);
      if (result.status === 'sent') showSuccess('Email sent');
      else if (result.status === 'sandboxed') showSuccess('Accepted in sandbox mode — not actually delivered');
      else if (result.status === 'skipped') showError('No email sender is configured in this environment');
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
      const { attempted, remaining } = await apiRetryAllEmailDeliveries();
      if (remaining === 0) showSuccess(`Sent all ${attempted}`);
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
          <MailX size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-white">
              {issues.length} notification{issues.length === 1 ? '' : 's'} not emailed
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              These reached people in the portal, but the email never went out. Everything else about them worked
              normally.
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
            key={issue.notificationId}
            className="flex items-start justify-between gap-3 bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-sm text-white truncate">
                {issue.title}
                <span className="text-gray-500"> · {new Date(issue.createdAt).toLocaleString()}</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {issue.recipientName ?? 'Unknown recipient'}
                {issue.recipientEmail ? ` · ${issue.recipientEmail}` : ''}
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
              disabled={retryingId === issue.notificationId}
              className="flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 text-xs rounded-md border border-zinc-700 text-gray-300 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={12} className={retryingId === issue.notificationId ? 'animate-spin' : ''} />
              Retry
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
