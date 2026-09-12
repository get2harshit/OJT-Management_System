import { useState, useEffect, useCallback } from 'react';
import { Award, Loader2, User, Users } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import { apiGetMyEvaluationsRedacted } from '../../lib/api/evaluations';
import type { StudentVisibleEvaluation } from '../../lib/types';
import { useToast } from '../../toast';
import { formatDateDisplay } from '../../lib/utils';
import { usePageRefresh } from '../../context/RefreshContext';

/**
 * A student's own view of their vivas — deliberately narrow. Which
 * evaluation, its date window, and who's on the panel. No marks, no
 * feedback, not even the final number — the backend never sends them here
 * at all (see StudentVisibleEvaluation on the service), so there's nothing
 * this page could show even if it wanted to.
 */
export default function StudentEvaluations() {
  const { showError } = useToast();
  const [evaluations, setEvaluations] = useState<StudentVisibleEvaluation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEvaluations(await apiGetMyEvaluationsRedacted());
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load your evaluations');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    load();
  }, [load]);

  usePageRefresh(load);

  // Soonest window first — what's coming up matters more than what already
  // happened.
  const sorted = [...evaluations].sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <PageLayout className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Award className="text-gold" size={22} />
          My Evaluations
        </h1>
        <p className="text-sm text-gray-400 mt-1">Your vivas, their windows, and who's on your panel.</p>
      </div>

      {loading ? (
        <div className="py-16 flex items-center justify-center">
          <Loader2 size={22} className="animate-spin text-gray-500" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-zinc-850 border border-zinc-750 rounded-2xl p-8 text-center">
          <p className="text-sm text-gray-300">No evaluations set up for you yet.</p>
          <p className="text-xs text-gray-500 mt-1.5">They'll appear here once your OJT's admin activates one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((evaluation) => (
            <div key={evaluation.id} className="bg-zinc-850 border border-zinc-750 rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-white font-semibold">{evaluation.evaluationName}</h3>
                <span className="text-xs text-gray-400 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1">
                  {formatDateDisplay(evaluation.startDate)} → {formatDateDisplay(evaluation.endDate)}
                </span>
              </div>

              <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-zinc-800">
                <div className="flex items-center gap-2 text-sm">
                  <User size={14} className="text-gray-500 shrink-0" />
                  <span className="text-gray-500">Primary:</span>
                  <span className="text-gray-200">{evaluation.primaryMentorName ?? 'Not assigned yet'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Users size={14} className="text-gray-500 shrink-0" />
                  <span className="text-gray-500">Secondary:</span>
                  <span className="text-gray-200">
                    {evaluation.secondaryMentorNames.length > 0 ? evaluation.secondaryMentorNames.join(', ') : 'None'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageLayout>
  );
}
