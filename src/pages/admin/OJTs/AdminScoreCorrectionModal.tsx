import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, X, Loader2 } from 'lucide-react';
import Select from '../../../components/Select';
import Button from '../../../components/Button';
import { apiGetEvaluationDetail, apiAdminScoreEvaluation } from '../../../lib/api/evaluations';
import type { EvaluationDetail } from '../../../lib/types';
import { useToast } from '../../../toast';

/**
 * Admin correcting a specific panelist's score — distinct from a panelist's
 * own scoring modal (EvaluationTracker), which only ever submits the
 * CALLER's own row. Here the admin picks WHICH panelist's row to correct,
 * since they aren't a panelist on this evaluation themselves.
 */
export function AdminScoreCorrectionModal({
  evaluationId,
  onClose,
  onUpdated,
}: {
  evaluationId: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { showError, showSuccess } = useToast();
  const [detail, setDetail] = useState<EvaluationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEvaluatorId, setSelectedEvaluatorId] = useState('');
  const [scoreDraft, setScoreDraft] = useState<Record<string, string>>({});
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGetEvaluationDetail(evaluationId);
      setDetail(res);
      if (res.panelists.length > 0) setSelectedEvaluatorId(res.panelists[0].evaluatorId);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load evaluation');
      onClose();
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluationId]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedPanelist = detail?.panelists.find((p) => p.evaluatorId === selectedEvaluatorId) ?? null;

  // Same split every scoring surface respects: primary scores every
  // criterion, secondary only the ones every panelist scores.
  const myCriteria = detail?.criteria.filter((c) => selectedPanelist?.role === 'primary' || c.scoredBy === 'panel') ?? [];

  // Re-seed the draft whenever the picked panelist changes, from THAT
  // panelist's own existing breakdown.
  useEffect(() => {
    if (!detail || !selectedPanelist) return;
    const draft: Record<string, string> = {};
    for (const c of myCriteria) {
      const existing = selectedPanelist.scoreBreakdown?.[c.name];
      draft[c.name] = existing !== undefined && existing !== null ? String(existing) : '';
    }
    setScoreDraft(draft);
    setFeedbackDraft(selectedPanelist.feedback || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvaluatorId, detail]);

  const canSubmit =
    !!detail &&
    myCriteria.length > 0 &&
    myCriteria.every((c) => {
      const raw = scoreDraft[c.name];
      if (raw === undefined || raw.trim() === '') return false;
      const n = Number(raw);
      return !Number.isNaN(n) && n >= 0 && n <= c.maxMarks;
    });

  const handleSubmit = async () => {
    if (!detail || !canSubmit) return;
    setSaving(true);
    try {
      const scoreBreakdown: Record<string, number> = {};
      for (const c of myCriteria) scoreBreakdown[c.name] = Number(scoreDraft[c.name]);
      await apiAdminScoreEvaluation(detail.id, selectedEvaluatorId, scoreBreakdown, feedbackDraft.trim() || undefined);
      showSuccess('Score corrected.');
      onUpdated();
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to correct score');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-zinc-900 border border-zinc-750 rounded-2xl shadow-2xl p-6 mx-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <ShieldCheck size={18} className="text-gold" />
            Correct Score
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-gray-500" />
          </div>
        ) : detail ? (
          <div className="space-y-4">
            <div>
              <h4 className="text-white font-semibold text-sm">
                {detail.studentName} — {detail.sequenceNo ? `${detail.evaluationTypeName} ${detail.sequenceNo}` : detail.evaluationTypeName}
              </h4>
              {detail.finalMarksObtained !== null && (
                <p className="text-xs text-gold mt-1">
                  Final (best of panel): {detail.finalMarksObtained}/{detail.maxMarksSnapshot}
                  {detail.averageMarksObtained !== null && (
                    <span className="text-gray-500"> · Average: {detail.averageMarksObtained}/{detail.maxMarksSnapshot}</span>
                  )}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Which panelist</label>
              <Select
                value={selectedEvaluatorId}
                onChange={setSelectedEvaluatorId}
                options={detail.panelists.map((p) => ({
                  value: p.evaluatorId,
                  label: `${p.evaluatorName || 'Unknown'} (${p.role === 'secondary' ? 'Secondary' : 'Primary'})${
                    p.totalMarks !== null ? ` — ${p.totalMarks}/${detail.maxMarksSnapshot}` : ' — not scored yet'
                  }`,
                }))}
              />
            </div>

            {selectedPanelist && (
              <>
                <div className="space-y-3">
                  {myCriteria.map((c) => (
                    <div key={c.id}>
                      <label className="block text-sm text-gray-400 mb-1">
                        {c.name} (0–{c.maxMarks})
                        {c.scoredBy === 'primary' && (
                          <span className="ml-1.5 text-[10px] text-gray-500 uppercase tracking-wide">Primary only</span>
                        )}
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={c.maxMarks}
                        value={scoreDraft[c.name] ?? ''}
                        onChange={(e) => setScoreDraft((prev) => ({ ...prev, [c.name]: e.target.value }))}
                        className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Feedback (optional)</label>
                  <textarea
                    value={feedbackDraft}
                    onChange={(e) => setFeedbackDraft(e.target.value)}
                    rows={3}
                    className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold resize-none"
                  />
                </div>

                <p className="text-[11px] text-gray-500">
                  This is logged as an admin correction, separate from {selectedPanelist.evaluatorName || 'the panelist'}'s own
                  submission history.
                </p>

                <Button onClick={handleSubmit} disabled={!canSubmit || saving} fullWidth>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                  {selectedPanelist.totalMarks !== null ? 'Update Score' : 'Submit Score'}
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
