import { useState, useEffect, useCallback } from 'react';
import { Award, Loader2, Users } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import { apiGetMyEvaluationsRedacted } from '../../lib/api/evaluations';
import type { StudentVisibleEvaluation } from '../../lib/types';
import { useToast } from '../../toast';
import { formatDateDisplay } from '../../lib/utils';
import { usePageRefresh } from '../../context/RefreshContext';

/**
 * A student's own view of their vivas — deliberately narrow. Which
 * evaluation, its date window, (once marked) their attendance status, and
 * who's evaluating them. No marks, no feedback, not even the final number
 * — the backend never sends them here at all (see StudentVisibleEvaluation
 * on the service), so there's nothing this page could show even if it
 * wanted to. Primary/secondary is an internal panel-role distinction, not
 * something a student needs to know — every evaluator's name is shown
 * together under one "Evaluator(s)" list instead.
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
        <p className="text-sm text-gray-400 mt-1">Your vivas, their windows, and who's evaluating you.</p>
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
          {sorted.map((evaluation) => {
            // Primary/secondary is an internal panel-role distinction — a
            // student sees one undifferentiated list of who's evaluating them.
            const evaluatorNames = [evaluation.primaryMentorName, ...evaluation.secondaryMentorNames].filter(
              (name): name is string => !!name,
            );
            return (
              <div key={evaluation.id} className="bg-zinc-850 border border-zinc-750 rounded-2xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    {evaluation.evaluationName}
                    {evaluation.attendanceStatus && (
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                          evaluation.attendanceStatus === 'present'
                            ? 'text-green-400 border-green-500/30 bg-green-500/10'
                            : evaluation.attendanceStatus === 'absent'
                            ? 'text-red-400 border-red-500/30 bg-red-500/10'
                            : 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'
                        }`}
                      >
                        {evaluation.attendanceStatus}
                      </span>
                    )}
                  </h3>
                  <span className="text-xs text-gray-400 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1">
                    {formatDateDisplay(evaluation.startDate)} → {formatDateDisplay(evaluation.endDate)}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-sm mt-3 pt-3 border-t border-zinc-800">
                  <Users size={14} className="text-gray-500 shrink-0" />
                  <span className="text-gray-500">Evaluator{evaluatorNames.length !== 1 ? 's' : ''}:</span>
                  <span className="text-gray-200">
                    {evaluatorNames.length > 0 ? evaluatorNames.join(', ') : 'Not assigned yet'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageLayout>
  );
}
