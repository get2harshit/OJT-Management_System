import { useState } from 'react';
import { Pencil, X } from 'lucide-react';
import type { CohortEvaluationConfig } from '../../../lib/types';
import { apiUpdateCohortEvaluationConfig } from '../../../lib/api/evaluations';
import { useToast } from '../../../toast';

/**
 * Only the fields that stay editable no matter what — dates and panel
 * size. Everything structural (type, rubric, sequence, track/batch scope)
 * locks the moment any student is assigned under a config, since changing
 * any of those in place would desync already-created evaluation rows from
 * what the config now claims to be. There is no client-side way to know
 * "has anyone been assigned yet" from the config list alone, so this modal
 * doesn't try to conditionally show the locked fields — it only offers what
 * is ALWAYS safe, and lets the server's own error explain the rest if an
 * admin genuinely needs to change scope (delete and recreate is the
 * intended path once that lock applies).
 */
export function EditEvaluationConfigModal({
  config,
  onClose,
  onUpdated,
}: {
  config: CohortEvaluationConfig;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { showError, showSuccess } = useToast();
  const [startDate, setStartDate] = useState(config.startDate.slice(0, 10));
  const [endDate, setEndDate] = useState(config.endDate.slice(0, 10));
  const [externalEvaluatorCount, setExternalEvaluatorCount] = useState(String(config.externalEvaluatorCount));
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = !!startDate && !!endDate && new Date(startDate) < new Date(endDate);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await apiUpdateCohortEvaluationConfig(config.id, {
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        externalEvaluatorCount: Number(externalEvaluatorCount) || 0,
      });
      showSuccess('Evaluation updated.');
      onUpdated();
      onClose();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to update evaluation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-zinc-900 border border-zinc-750 rounded-2xl shadow-2xl p-6 mx-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Pencil size={16} className="text-gold" />
            Edit Evaluation
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        <p className="text-[11px] text-gray-500 mb-4">
          Type, rubric, sequence and scope can't change once students are assigned — dates and panel size always can.
          Delete and recreate this evaluation if its audience genuinely needs to change.
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">End Date</label>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">External Panelists</label>
            <input
              type="number"
              min={0}
              value={externalEvaluatorCount}
              onChange={(e) => setExternalEvaluatorCount(e.target.value)}
              className="w-24 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-5 pt-3 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white bg-zinc-800 hover:bg-zinc-750 rounded-lg border border-zinc-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="px-5 py-2 text-sm font-semibold text-black bg-gold hover:bg-gold-hover rounded-lg shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
