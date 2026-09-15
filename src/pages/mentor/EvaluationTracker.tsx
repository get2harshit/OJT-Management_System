import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Award, Loader2, ChevronLeft, UserCheck, UserX, CalendarOff } from 'lucide-react';
import DataTable from '../../components/DataTable';
import PageLayout from '../../components/PageLayout';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import SpinnerSquare from '../../components/SpinnerSquare';
import {
  apiGetMyEvaluationQueue,
  apiGetMyEvaluationConfigs,
  apiGetEvaluationDetail,
  apiScoreEvaluation,
  apiMarkEvaluationAttendance,
  MAX_FEEDBACK_LENGTH,
} from '../../lib/api/evaluations';
import type { EvaluatorConfigSummary } from '../../lib/api/evaluations';
import type { EvaluatorQueueItem, EvaluationDetail, EvaluationAttendanceStatus } from '../../lib/types';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../toast';
import { usePageRefresh } from '../../context/RefreshContext';

const PAGE_SIZE = 20;

// A mentor (internal or, via the same panel, external) scores whatever
// evaluations they're a panelist on — the backend assigns panelists
// automatically when admin activates a cohort's evaluation, so this page is
// purely a queue: nothing to set up here, just score what's assigned.
//
// Two levels: which viva (one row per config, with how many of this
// mentor's own students are scored), then — once one is picked — that
// viva's own student queue, same table this page always had. Mirrors the
// admin's own Configured Evaluations -> Blueprint drill-down.
export default function MentorEvaluationTracker() {
  // The OJT this queue is scoped to, from the route.
  const { cohortId } = useParams<{ cohortId: string }>();
  const { user } = useAuth();
  const myId = user?.id;
  const { showSuccess, showError } = useToast();

  const [configs, setConfigs] = useState<EvaluatorConfigSummary[]>([]);
  const [configsLoading, setConfigsLoading] = useState(true);
  const [selectedConfig, setSelectedConfig] = useState<EvaluatorConfigSummary | null>(null);

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
  const [markingAttendance, setMarkingAttendance] = useState(false);

  const loadConfigs = useCallback(async () => {
    setConfigsLoading(true);
    try {
      const res = await apiGetMyEvaluationConfigs(cohortId);
      setConfigs(res);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load your evaluations');
    } finally {
      setConfigsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohortId]);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const loadQueue = useCallback(async () => {
    if (!selectedConfig) return;
    setLoading(true);
    try {
      const res = await apiGetMyEvaluationQueue({ page, limit, cohortId, configId: selectedConfig.configId });
      setQueue(res.data);
      setTotal(res.pagination.total);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load your evaluation queue');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, cohortId, selectedConfig?.configId]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  usePageRefresh(
    useCallback(async () => {
      await Promise.all([loadConfigs(), selectedConfig ? loadQueue() : Promise.resolve()]);
    }, [loadConfigs, loadQueue, selectedConfig])
  );

  const openViva = (config: EvaluatorConfigSummary) => {
    setPage(1);
    setSelectedConfig(config);
  };

  const backToVivas = () => {
    setSelectedConfig(null);
    setQueue([]);
  };

  const openEvaluation = async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await apiGetEvaluationDetail(id);
      setDetail(res);
      const mine = res.panelists.find((p) => p.evaluatorId === myId);
      // Only the criteria I'm actually allowed to score, into the draft —
      // a secondary panelist never sees a primary-only one (they never
      // saw the PRD/logbook it's judging), so there's nothing to pre-fill
      // or submit for it.
      const myCriteria = res.criteria.filter((c) => mine?.role === 'primary' || c.scoredBy === 'panel');
      const draft: Record<string, string> = {};
      for (const c of myCriteria) {
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

  // Primary-only — the gate ahead of scoring. present unlocks the rubric
  // form below for every panelist; absent/excused close the evaluation
  // immediately, nothing left to score.
  const handleMarkAttendance = async (status: EvaluationAttendanceStatus) => {
    if (!detail) return;
    setMarkingAttendance(true);
    try {
      await apiMarkEvaluationAttendance(detail.id, status);
      const refreshed = await apiGetEvaluationDetail(detail.id);
      setDetail(refreshed);
      if (status !== 'present') {
        showSuccess(`Marked ${status}.`);
        await Promise.all([loadQueue(), loadConfigs()]);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to mark attendance');
    } finally {
      setMarkingAttendance(false);
    }
  };

  const closeModal = () => {
    setSelectedId(null);
    setDetail(null);
    setScoreDraft({});
    setFeedbackDraft('');
  };

  // Which of the rubric's criteria I'm allowed to score — the primary
  // (the student's own mentor) scores everything; a secondary only scores
  // the ones every panelist scores, never an artifact-only one they never
  // saw the underlying document for. Matches exactly what the server
  // validates, so a submission built from this never gets rejected for
  // having the wrong set of keys.
  const myPanelist = detail?.panelists.find((p) => p.evaluatorId === myId);
  const myCriteria = detail?.criteria.filter((c) => myPanelist?.role === 'primary' || c.scoredBy === 'panel') ?? [];

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

  const handleSubmitScore = async () => {
    if (!detail || !canSubmit) return;
    setSaving(true);
    try {
      const scoreBreakdown: Record<string, number> = {};
      for (const c of myCriteria) {
        scoreBreakdown[c.name] = Number(scoreDraft[c.name]);
      }
      await apiScoreEvaluation(detail.id, scoreBreakdown, feedbackDraft.trim());
      showSuccess('Score submitted.');
      closeModal();
      await Promise.all([loadQueue(), loadConfigs()]);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to submit score');
    } finally {
      setSaving(false);
    }
  };

  const tableData = queue.map((q) => ({
    id: q.id,
    teamName: q.teamName || '—',
    studentName: q.studentName || '—',
    trackName: q.trackName || '—',
    projectTitle: q.projectTitle || '—',
    myRole: q.myRole === 'secondary' ? 'Secondary Evaluator' : 'Primary Evaluator',
    myScore:
      q.attendanceStatus === 'absent' ? 'Absent'
      : q.attendanceStatus === 'excused' ? 'Excused'
      : q.attendanceStatus == null ? 'Attendance pending'
      : q.myTotalMarks !== null ? String(q.myTotalMarks)
      : 'Not scored',
    myScoreSet: q.myTotalMarks !== null || q.attendanceStatus === 'absent',
    finalScore: q.finalMarksObtained !== null ? String(q.finalMarksObtained) : '—',
  }));

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

      {!selectedConfig ? (
        configsLoading ? (
          <div className="min-h-[30vh] flex items-center justify-center">
            <SpinnerSquare size={40} />
          </div>
        ) : configs.length === 0 ? (
          <div className="border border-dashed border-zinc-800 rounded-xl py-10 flex flex-col items-center justify-center gap-2 text-center px-6">
            <Award size={22} className="text-gray-600 mb-1" />
            <p className="text-gray-400 text-sm font-medium">Nothing assigned to you yet.</p>
            <p className="text-gray-500 text-xs max-w-sm">You'll see a viva here once an admin activates one you're a panelist on.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {configs.map((c) => (
              <button
                key={c.configId}
                onClick={() => openViva(c)}
                className="text-left bg-zinc-850 border border-zinc-750 rounded-2xl p-4 hover:border-gold/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-white font-semibold">{c.evaluationName}</h3>
                  <span className="text-xs text-gray-500 shrink-0">{c.maxMarksSnapshot} marks</span>
                </div>

                {c.trackNames.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {c.trackNames.map((name) => (
                      <span key={name} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gold/10 border border-gold/25 text-gold">
                        {name}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-500/10 text-gray-400">
                    {c.teamCount} team{c.teamCount !== 1 ? 's' : ''}
                  </span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-500/10 text-gray-400">
                    {c.studentCount} student{c.studentCount !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-zinc-800">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded border text-gray-400 bg-zinc-800 border-zinc-700">
                    {c.notStartedCount} not started
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded border text-gold bg-gold/10 border-gold/25">
                    {c.pendingCount} pending
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded border text-green-400 bg-green-500/10 border-green-500/25">
                    {c.completedCount} completed
                  </span>
                </div>
              </button>
            ))}
          </div>
        )
      ) : (
        <>
          <button
            onClick={backToVivas}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={14} />
            Back to vivas
          </button>

          <DataTable
            columns={[
              { key: 'teamName', header: 'Team' },
              { key: 'studentName', header: 'Student' },
              { key: 'trackName', header: 'Track' },
              {
                key: 'projectTitle',
                header: 'Project',
                // Project titles run long and unpredictable — truncate with
                // an ellipsis and keep the full title on hover rather than
                // let one row stretch the whole table wide.
                render: (row) => (
                  <span className="block max-w-[320px] truncate" title={row.projectTitle as string}>
                    {row.projectTitle}
                  </span>
                ),
              },
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
            loading={loading}
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
        </>
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
                  {detail.averageMarksObtained !== null && (
                    <span className="text-gray-500"> · Average: {detail.averageMarksObtained}/{detail.maxMarksSnapshot}</span>
                  )}
                </p>
              )}
            </div>

            {detail.attendanceStatus == null ? (
              // Nobody scores ahead of attendance — there's nothing to
              // judge until it's known whether the student showed up.
              myPanelist?.role === 'primary' ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
                  <p className="text-sm text-white font-medium">Was {detail.studentName || 'the student'} present for this evaluation?</p>
                  <p className="text-xs text-gray-500">Mark attendance first — the rubric opens once you do.</p>
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
              ) : (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-400">Waiting on the primary mentor to mark attendance before this can be scored.</p>
                </div>
              )
            ) : detail.attendanceStatus !== 'present' ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
                <p className="text-sm text-white">
                  This evaluation is closed — {detail.studentName || 'the student'} was marked{' '}
                  <span className={detail.attendanceStatus === 'absent' ? 'text-red-400 font-semibold' : 'text-yellow-400 font-semibold'}>
                    {detail.attendanceStatus}
                  </span>
                  .
                </p>
                {detail.attendanceStatus === 'absent' && (
                  <p className="text-xs text-gray-500">Counted as 0/{detail.maxMarksSnapshot} in the overall.</p>
                )}
                {detail.attendanceStatus === 'excused' && (
                  <p className="text-xs text-gray-500">No marks recorded — left out of the overall, like an unheld evaluation.</p>
                )}
                {myPanelist?.role === 'primary' && (
                  <button
                    onClick={() => handleMarkAttendance('present')}
                    disabled={markingAttendance}
                    className="text-xs text-gold hover:text-gold-hover font-medium disabled:opacity-50"
                  >
                    Marked by mistake? Correct to Present
                  </button>
                )}
              </div>
            ) : (
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
                    placeholder="Required — what stood out, what to improve"
                    className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold resize-none"
                  />
                  {/* Only once the limit is actually in reach. maxLength alone
                      silently truncates a long paste, which is the one case
                      where a mentor loses text without being told — a counter
                      on every ordinary two-line note would be noise. */}
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

                {otherPanelists.length > 0 && (
                  <div className="border-t border-zinc-800 pt-3 space-y-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Other panelist{otherPanelists.length !== 1 ? 's' : ''}</p>
                    {otherPanelists.map((p) => (
                      <div key={p.evaluatorId} className="flex items-center justify-between text-sm bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
                        <span className="text-gray-300">{p.evaluatorName || 'Unknown'} ({p.role === 'secondary' ? 'Secondary' : 'Primary'})</span>
                        <span className={p.totalMarks !== null ? 'text-gold font-semibold' : 'text-gray-500'}>
                          {p.totalMarks !== null ? `${p.totalMarks}/${detail.maxMarksSnapshot}` : 'Not scored yet'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <Button onClick={handleSubmitScore} disabled={!canSubmit || saving} fullWidth>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                  {myPanelist?.totalMarks !== null && myPanelist !== undefined ? 'Update Score' : 'Submit Score'}
                </Button>
              </>
            )}
          </div>
        ) : null}
      </Modal>
    </PageLayout>
  );
}
