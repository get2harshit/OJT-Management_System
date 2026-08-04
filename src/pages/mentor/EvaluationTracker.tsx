import { useState, useEffect, useCallback } from 'react';
import { Award, Loader2 } from 'lucide-react';
import DataTable from '../../components/DataTable';
import PageLayout from '../../components/PageLayout';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import { apiGetMyEvaluationQueue, apiGetEvaluationDetail, apiScoreEvaluation } from '../../lib/api/evaluations';
import type { EvaluatorQueueItem, EvaluationDetail } from '../../lib/types';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../toast';
import { usePageRefresh } from '../../context/RefreshContext';

const PAGE_SIZE = 20;

// A mentor (internal or, via the same panel, external) scores whatever
// evaluations they're a panelist on — the backend assigns panelists
// automatically when admin activates a cohort's evaluation, so this page is
// purely a queue: nothing to set up here, just score what's assigned.
export default function MentorEvaluationTracker() {
  const { user } = useAuth();
  const myId = user?.id;
  const { showSuccess, showError } = useToast();

  const [queue, setQueue] = useState<EvaluatorQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [total, setTotal] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EvaluationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [scoreDraft, setScoreDraft] = useState<Record<string, string>>({});
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGetMyEvaluationQueue({ page, limit });
      setQueue(res.data);
      setTotal(res.pagination.total);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load your evaluation queue');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  usePageRefresh(loadQueue);

  const openEvaluation = async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await apiGetEvaluationDetail(id);
      setDetail(res);
      const mine = res.panelists.find((p) => p.evaluatorId === myId);
      const draft: Record<string, string> = {};
      for (const c of res.criteria) {
        const existing = mine?.scoreBreakdown?.[c.name];
        draft[c.name] = existing !== undefined && existing !== null ? String(existing) : '';
      }
      setScoreDraft(draft);
      setFeedbackDraft(mine?.feedback || '');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load evaluation');
      setSelectedId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedId(null);
    setDetail(null);
    setScoreDraft({});
    setFeedbackDraft('');
  };

  const canSubmit =
    !!detail &&
    detail.criteria.every((c) => {
      const raw = scoreDraft[c.name];
      if (raw === undefined || raw.trim() === '') return false;
      const n = Number(raw);
      return !Number.isNaN(n) && n >= 0 && n <= c.maxMarks;
    });

  const handleSubmitScore = async () => {
    if (!detail || !canSubmit) return;
    setSaving(true);
    try {
      const scoreBreakdown: Record<string, number> = {};
      for (const c of detail.criteria) {
        scoreBreakdown[c.name] = Number(scoreDraft[c.name]);
      }
      await apiScoreEvaluation(detail.id, scoreBreakdown, feedbackDraft.trim() || undefined);
      showSuccess('Score submitted.');
      closeModal();
      await loadQueue();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to submit score');
    } finally {
      setSaving(false);
    }
  };

  const tableData = queue.map((q) => ({
    id: q.id,
    studentName: q.studentName || '—',
    evaluation: q.sequenceNo ? `${q.evaluationTypeName} ${q.sequenceNo}` : q.evaluationTypeName,
    myRole: q.myRole === 'external' ? 'External' : 'Internal',
    myScore: q.myTotalMarks !== null ? `${q.myTotalMarks}/${q.maxMarksSnapshot}` : 'Not scored',
    myScoreSet: q.myTotalMarks !== null,
    finalScore: q.finalMarksObtained !== null ? `${q.finalMarksObtained}/${q.maxMarksSnapshot}` : '—',
  }));

  const myScore = detail?.panelists.find((p) => p.evaluatorId === myId);
  const otherPanelists = detail?.panelists.filter((p) => p.evaluatorId !== myId) || [];

  return (
    <PageLayout className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Award className="text-gold" size={26} />
          Evaluation Tracker
        </h1>
        <p className="text-gray-400 text-sm mt-1">Score the evaluations you've been assigned as a panelist.</p>
      </div>

      <DataTable
        columns={[
          { key: 'studentName', header: 'Student' },
          { key: 'evaluation', header: 'Evaluation' },
          { key: 'myRole', header: 'My Role' },
          {
            key: 'myScore',
            header: 'My Score',
            render: (row) => (
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                  row.myScoreSet
                    ? 'text-gold bg-gold/10 border-gold/25'
                    : 'text-gray-500 bg-zinc-800 border-zinc-700'
                }`}
              >
                {row.myScore}
              </span>
            ),
          },
          { key: 'finalScore', header: 'Final' },
        ]}
        data={tableData}
        searchPlaceholder="Search by student name..."
        hideExport
        onRowClick={(row) => openEvaluation(row.id as string)}
        serverPagination={{
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
          onPageChange: setPage,
          onLimitChange: (l) => {
            setPage(1);
            setLimit(l);
          },
        }}
      />
      {!loading && queue.length === 0 && (
        <p className="text-gray-500 text-sm text-center py-8">No evaluations assigned to you yet.</p>
      )}

      <Modal open={!!selectedId} onClose={closeModal} title="Score Evaluation" size="lg">
        {detailLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={28} className="animate-spin text-gray-500" />
          </div>
        ) : detail ? (
          <div className="space-y-5">
            <div>
              <h4 className="text-white font-semibold">
                {detail.studentName} — {detail.sequenceNo ? `${detail.evaluationTypeName} ${detail.sequenceNo}` : detail.evaluationTypeName}
              </h4>
              {detail.finalMarksObtained !== null && (
                <p className="text-xs text-gold mt-1">
                  Final (best of panel): {detail.finalMarksObtained}/{detail.maxMarksSnapshot}
                </p>
              )}
            </div>

            <div className="space-y-3">
              {detail.criteria.map((c) => (
                <div key={c.id}>
                  <label className="block text-sm text-gray-400 mb-1">
                    {c.name} (0–{c.maxMarks})
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

            {otherPanelists.length > 0 && (
              <div className="border-t border-zinc-800 pt-3 space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Other panelist{otherPanelists.length !== 1 ? 's' : ''}</p>
                {otherPanelists.map((p) => (
                  <div key={p.evaluatorId} className="flex items-center justify-between text-sm bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
                    <span className="text-gray-300">{p.evaluatorName || 'Unknown'} ({p.role === 'external' ? 'External' : 'Internal'})</span>
                    <span className={p.totalMarks !== null ? 'text-gold font-semibold' : 'text-gray-500'}>
                      {p.totalMarks !== null ? `${p.totalMarks}/${detail.maxMarksSnapshot}` : 'Not scored yet'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <Button onClick={handleSubmitScore} disabled={!canSubmit || saving} fullWidth>
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {myScore?.totalMarks !== null && myScore !== undefined ? 'Update Score' : 'Submit Score'}
            </Button>
          </div>
        ) : null}
      </Modal>
    </PageLayout>
  );
}
