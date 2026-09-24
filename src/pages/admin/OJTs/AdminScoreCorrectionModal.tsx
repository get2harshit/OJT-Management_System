import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, X, Loader2, UserCheck, UserX, CalendarOff } from 'lucide-react';
import Select from '../../../components/Select';
import Button from '../../../components/Button';
import {
  apiGetEvaluationDetail,
  apiAdminScoreEvaluation,
  apiMarkEvaluationAttendance,
  MAX_FEEDBACK_LENGTH,
} from '../../../lib/api/evaluations';
import type { EvaluationDetail, EvaluationAttendanceStatus } from '../../../lib/types';
import { useToast } from '../../../toast';

/**
 * Admin correcting a specific panelist's score — distinct from a panelist's
 * own scoring modal (EvaluationTracker), which only ever submits the
 * CALLER's own row. Here the admin picks WHICH panelist's row to correct,
 * since they aren't a panelist on this evaluation themselves.
 *
 * Scoring sits behind the same attendance gate as the mentor's form, so the
 * admin can mark attendance here too — the override for a primary who never
 * did. Whoever marks it is recorded on the evaluation.
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
  const [markingAttendance, setMarkingAttendance] = useState(false);

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

  // The server refuses moving off present once anyone has scored — correct
  // the scores instead. Offered only when it would be accepted.
  const anyScored = detail?.panelists.some((p) => p.totalMarks !== null) ?? false;

  const handleMarkAttendance = async (status: EvaluationAttendanceStatus) => {
    if (!detail) return;
    setMarkingAttendance(true);
    try {
      await apiMarkEvaluationAttendance(detail.id, status);
      setDetail(await apiGetEvaluationDetail(detail.id));
      showSuccess(`Marked ${status}.`);
      onUpdated();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to mark attendance');
    } finally {
      setMarkingAttendance(false);
    }
  };

  const canSubmit =
    !!detail &&
    detail.attendanceStatus === 'present' &&
    myCriteria.length > 0 &&
    feedbackDraft.trim() !== '' &&
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
      await apiAdminScoreEvaluation(detail.id, selectedEvaluatorId, scoreBreakdown, feedbackDraft.trim());
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

            {detail.attendanceStatus == null ? (
              <div className="bg-zinc-800/60 border border-zinc-750 rounded-lg p-4 space-y-3">
                <p className="text-sm text-white font-medium">
                  Attendance hasn&apos;t been marked for {detail.studentName || 'this student'}.
                </p>
                <p className="text-xs text-gray-500">
                  Scores open once it is. Marking it here overrides the primary mentor and is recorded under your name.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleMarkAttendance('present')}
                    disabled={markingAttendance}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-lg border border-zinc-700 text-gray-300 hover:border-green-500/50 hover:text-green-400 disabled:opacity-50 transition-colors"
                  >
                    <UserCheck size={16} />
                    <span className="text-xs font-medium">Present</span>
                  </button>
                  <button
                    onClick={() => handleMarkAttendance('absent')}
                    disabled={markingAttendance}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-lg border border-zinc-700 text-gray-300 hover:border-red-500/50 hover:text-red-400 disabled:opacity-50 transition-colors"
                  >
                    <UserX size={16} />
                    <span className="text-xs font-medium">Absent</span>
                  </button>
                  <button
                    onClick={() => handleMarkAttendance('excused')}
                    disabled={markingAttendance}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-lg border border-zinc-700 text-gray-300 hover:border-yellow-500/50 hover:text-yellow-400 disabled:opacity-50 transition-colors"
                  >
                    <CalendarOff size={16} />
                    <span className="text-xs font-medium">Excused</span>
                  </button>
                </div>
              </div>
            ) : detail.attendanceStatus !== 'present' ? (
              <div className="bg-zinc-800/60 border border-zinc-750 rounded-lg p-4 space-y-2">
                <p className="text-sm text-white">
                  Closed — {detail.studentName || 'the student'} was marked{' '}
                  <span className={detail.attendanceStatus === 'absent' ? 'text-red-400 font-semibold' : 'text-yellow-400 font-semibold'}>
                    {detail.attendanceStatus}
                  </span>
                  .
                </p>
                {detail.attendanceStatus === 'absent' && (
                  <p className="text-xs text-gray-500">Counted as 0/{detail.maxMarksSnapshot} in the overall.</p>
                )}
                {detail.attendanceStatus === 'excused' && (
                  <p className="text-xs text-gray-500">No marks recorded — left out of the overall.</p>
                )}
                <div className="flex gap-4">
                  <button
                    onClick={() => handleMarkAttendance('present')}
                    disabled={markingAttendance}
                    className="text-xs text-gold hover:text-gold-hover font-medium disabled:opacity-50"
                  >
                    Correct to Present
                  </button>
                  <button
                    onClick={() => handleMarkAttendance(detail.attendanceStatus === 'absent' ? 'excused' : 'absent')}
                    disabled={markingAttendance}
                    className="text-xs text-gray-400 hover:text-white font-medium disabled:opacity-50"
                  >
                    Change to {detail.attendanceStatus === 'absent' ? 'Excused' : 'Absent'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-gray-400">
                  Attendance: <span className="text-green-400 font-semibold">Present</span>
                </span>
                {!anyScored && (
                  <span className="flex gap-3">
                    <button
                      onClick={() => handleMarkAttendance('absent')}
                      disabled={markingAttendance}
                      className="text-gray-400 hover:text-red-400 font-medium disabled:opacity-50"
                    >
                      Mark Absent
                    </button>
                    <button
                      onClick={() => handleMarkAttendance('excused')}
                      disabled={markingAttendance}
                      className="text-gray-400 hover:text-yellow-400 font-medium disabled:opacity-50"
                    >
                      Mark Excused
                    </button>
                  </span>
                )}
              </div>
            )}

            {selectedPanelist && detail.attendanceStatus === 'present' && (
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
                  <label className="block text-sm text-gray-400 mb-1">
                    Feedback <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={feedbackDraft}
                    onChange={(e) => setFeedbackDraft(e.target.value)}
                    rows={3}
                    maxLength={MAX_FEEDBACK_LENGTH}
                    placeholder="Required"
                    className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold resize-none"
                  />
                  {/* Same rule as the mentor's own scoring form: shown only
                      once the limit is in reach, since maxLength truncates a
                      long paste without saying so. */}
                  {feedbackDraft.length > MAX_FEEDBACK_LENGTH - 500 && (
                    <p
                      className={`mt-1 text-[11px] text-right ${
                        feedbackDraft.length >= MAX_FEEDBACK_LENGTH ? 'text-amber-400/90' : 'text-gray-500'
                      }`}
                    >
                      {feedbackDraft.length} / {MAX_FEEDBACK_LENGTH}
                      {feedbackDraft.length >= MAX_FEEDBACK_LENGTH && ' — limit reached'}
                    </p>
                  )}
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
