import { useState, useEffect, useCallback } from 'react';
import { Pencil, X, RefreshCw, Plus } from 'lucide-react';
import type { ApiMentor, CohortEvaluationConfig } from '../../../lib/types';
import {
  apiUpdateCohortEvaluationConfig,
  apiGetMentorPairings,
  apiSetMentorPairings,
  apiReassignSecondaryMentor,
} from '../../../lib/api/evaluations';
import { apiGetCohortTrackConfig } from '../../../lib/api/tracks';
import { MentorPickerPanel } from './MentorPickerPanel';
import { useToast } from '../../../toast';

/**
 * Only the fields that stay editable no matter what — dates, panel size,
 * and (unlike before) the pairings themselves. Everything structural (type,
 * rubric, sequence, track/batch scope) locks the moment any student is
 * assigned under a config, since changing any of those in place would
 * desync already-created evaluation rows from what the config now claims to
 * be. There is no client-side way to know "has anyone been assigned yet"
 * from the config list alone, so this modal doesn't try to conditionally
 * show the locked fields — it only offers what is ALWAYS safe, and lets the
 * server's own error explain the rest if an admin genuinely needs to change
 * scope (delete and recreate is the intended path once that lock applies).
 *
 * Swapping an existing pairing here goes through apiReassignSecondaryMentor,
 * not apiSetMentorPairings — a student the old secondary already scored
 * keeps that exact panelist and mark, only the ones still waiting move onto
 * the new secondary. Filling a brand-new slot (nobody there to protect yet)
 * just upserts normally.
 */
export function EditEvaluationConfigModal({
  config,
  cohortMentors,
  onClose,
  onUpdated,
}: {
  config: CohortEvaluationConfig;
  cohortMentors: ApiMentor[];
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { showError, showSuccess } = useToast();
  const [startDate, setStartDate] = useState(config.startDate.slice(0, 10));
  const [endDate, setEndDate] = useState(config.endDate.slice(0, 10));
  const [secondaryEvaluatorCount, setSecondaryEvaluatorCount] = useState(String(config.secondaryEvaluatorCount));
  const [submitting, setSubmitting] = useState(false);

  // pairingsByPrimary[primaryMentorId] = [secondaryMentorId, ...] — loaded
  // once on open, then kept in sync locally as swaps/adds land, so the grid
  // never has to refetch mid-edit.
  const [pairingsByPrimary, setPairingsByPrimary] = useState<Record<string, string[]>>({});
  const [loadingPairings, setLoadingPairings] = useState(true);
  const [trackNameBySlug, setTrackNameBySlug] = useState<Map<string, string>>(new Map());
  // Which slot the picker drawer is filling: replacing an existing
  // secondary (oldSecondaryMentorId set) goes through the protect-scored-
  // marks reassign path; filling a brand-new one (undefined) is a plain add.
  const [pickerTarget, setPickerTarget] = useState<{ primaryMentorId: string; oldSecondaryMentorId?: string } | null>(
    null,
  );
  const [reassigning, setReassigning] = useState(false);

  const loadPairings = useCallback(async () => {
    setLoadingPairings(true);
    try {
      const [pairings, tracks] = await Promise.all([
        apiGetMentorPairings(config.id),
        apiGetCohortTrackConfig(config.cohortId),
      ]);
      const byPrimary: Record<string, string[]> = {};
      for (const p of pairings) {
        (byPrimary[p.primaryMentorId] ??= []).push(p.secondaryMentorId);
      }
      setPairingsByPrimary(byPrimary);
      setTrackNameBySlug(new Map(tracks.map((t) => [t.trackSlug, t.trackName])));
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to load mentor pairings');
    } finally {
      setLoadingPairings(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.id, config.cohortId]);

  useEffect(() => {
    loadPairings();
  }, [loadPairings]);

  const mentorById = new Map(cohortMentors.map((m) => [m.id, m]));
  const mentorLabel = (id: string) => mentorById.get(id)?.fullName || mentorById.get(id)?.email || 'Unknown';

  const canSubmit = !!startDate && !!endDate && new Date(startDate) < new Date(endDate);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await apiUpdateCohortEvaluationConfig(config.id, {
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        secondaryEvaluatorCount: Number(secondaryEvaluatorCount) || 0,
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

  const handlePick = async (newSecondaryMentorId: string) => {
    if (!pickerTarget) return;
    const { primaryMentorId, oldSecondaryMentorId } = pickerTarget;
    setReassigning(true);
    try {
      if (oldSecondaryMentorId) {
        const result = await apiReassignSecondaryMentor(config.id, {
          primaryMentorId,
          oldSecondaryMentorId,
          newSecondaryMentorId,
        });
        setPairingsByPrimary((prev) => ({
          ...prev,
          [primaryMentorId]: (prev[primaryMentorId] || []).map((id) =>
            id === oldSecondaryMentorId ? newSecondaryMentorId : id,
          ),
        }));
        if (result.reassignedCount > 0 && result.keptScoredCount === 0) {
          showSuccess(`Moved ${result.reassignedCount} student(s) to ${mentorLabel(newSecondaryMentorId)}.`);
        } else {
          const parts: string[] = [];
          if (result.reassignedCount > 0) parts.push(`${result.reassignedCount} moved`);
          if (result.keptScoredCount > 0) parts.push(`${result.keptScoredCount} kept (already scored)`);
          if (result.skippedConflictCount > 0) parts.push(`${result.skippedConflictCount} skipped (conflict)`);
          showSuccess(parts.length > 0 ? parts.join(', ') + '.' : 'Pairing updated — no students affected yet.');
        }
      } else {
        await apiSetMentorPairings(config.id, [{ primaryMentorId, secondaryMentorId: newSecondaryMentorId }]);
        setPairingsByPrimary((prev) => ({
          ...prev,
          [primaryMentorId]: [...(prev[primaryMentorId] || []), newSecondaryMentorId],
        }));
        showSuccess('Pairing added.');
      }
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to update pairing');
    } finally {
      setReassigning(false);
      setPickerTarget(null);
    }
  };

  const primaries = Object.keys(pairingsByPrimary);
  const declaredCount = Number(secondaryEvaluatorCount) || 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-zinc-900 border border-zinc-750 rounded-2xl shadow-2xl p-6 mx-4 animate-in fade-in zoom-in-95 duration-200">
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
          Type, rubric, sequence and scope can't change once students are assigned — dates, panel size and pairings
          always can. Delete and recreate this evaluation if its audience genuinely needs to change.
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
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Secondary Panelists</label>
            <input
              type="number"
              min={0}
              value={secondaryEvaluatorCount}
              onChange={(e) => setSecondaryEvaluatorCount(e.target.value)}
              className="w-24 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
              Mentor Pairings
            </label>
            {loadingPairings ? (
              <p className="text-xs text-gray-500">Loading...</p>
            ) : primaries.length === 0 ? (
              <p className="text-[11px] text-gray-500">
                No pairings declared yet for this evaluation — every student is scored by their primary mentor
                alone. Set a secondary panelist count above and add pairings from the create flow, or increase it
                here once students are already assigned.
              </p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto rounded-lg border border-zinc-800 p-2">
                {primaries.map((primaryId) => {
                  const secondaries = pairingsByPrimary[primaryId] || [];
                  const canAddMore = secondaries.length < declaredCount;
                  return (
                    <div key={primaryId} className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-gray-300 shrink-0 min-w-[100px]">{mentorLabel(primaryId)}</span>
                      {secondaries.map((secId) => (
                        <span
                          key={secId}
                          className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded-lg pl-2 pr-1 py-1"
                        >
                          <span className="text-xs text-white">{mentorLabel(secId)}</span>
                          <button
                            type="button"
                            title="Swap this secondary — students already scored by them stay untouched"
                            onClick={() => setPickerTarget({ primaryMentorId: primaryId, oldSecondaryMentorId: secId })}
                            className="p-1 rounded text-gray-500 hover:text-gold hover:bg-zinc-750"
                          >
                            <RefreshCw size={11} />
                          </button>
                        </span>
                      ))}
                      {canAddMore && (
                        <button
                          type="button"
                          onClick={() => setPickerTarget({ primaryMentorId: primaryId })}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-zinc-700 text-gray-500 hover:text-gold hover:border-gold/40 text-xs transition-colors"
                        >
                          <Plus size={11} /> Add
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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

      <MentorPickerPanel
        open={!!pickerTarget}
        onClose={() => !reassigning && setPickerTarget(null)}
        mentors={pickerTarget ? cohortMentors.filter((m) => m.id !== pickerTarget.primaryMentorId) : []}
        trackNameBySlug={trackNameBySlug}
        primaryMentorName={pickerTarget ? mentorLabel(pickerTarget.primaryMentorId) : ''}
        onSelect={handlePick}
      />
    </div>
  );
}
