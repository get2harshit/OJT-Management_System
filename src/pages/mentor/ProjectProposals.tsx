import { useState, useEffect, useCallback } from 'react';
import { ClipboardCheck, CheckCircle2, RotateCcw, Undo2, Users, AlertTriangle, ChevronRight } from 'lucide-react';
import SpinnerSquare from '../../components/SpinnerSquare';
import Modal from '../../components/Modal';
import type { PendingProposal } from '../../lib/types';
import type { ProposalDetail } from '../../lib/api';
import { apiGetPendingProposals, apiGetProposalDetail, apiDecideOnProposal } from '../../lib/api';
import { useToast } from '../../toast';
import { usePageRefresh } from '../../context/RefreshContext';

type PendingAction = 'resubmit' | 'return' | null;

export default function ProjectProposals() {
  const { showError, showSuccess } = useToast();

  const [proposals, setProposals] = useState<PendingProposal[]>([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<PendingProposal | null>(null);
  const [detail, setDetail] = useState<ProposalDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [actionNote, setActionNote] = useState('');
  const [deciding, setDeciding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGetPendingProposals();
      setProposals(res);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load pending proposals');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    load();
  }, [load]);

  usePageRefresh(load);

  const closeModal = () => {
    setSelected(null);
    setDetail(null);
    setPendingAction(null);
    setActionNote('');
  };

  useEffect(() => {
    if (!selected) return;
    setDetailLoading(true);
    apiGetProposalDetail(selected.preferenceId)
      .then(setDetail)
      .catch((err) => showError(err instanceof Error ? err.message : 'Failed to load project detail'))
      .finally(() => setDetailLoading(false));
  }, [selected, showError]);

  const handleDecide = async (action: 'approve' | 'resubmit' | 'return') => {
    if (!selected) return;
    if (action !== 'approve' && !actionNote.trim()) return;
    setDeciding(true);
    try {
      await apiDecideOnProposal(selected.preferenceId, action, action === 'approve' ? undefined : actionNote.trim());
      showSuccess(
        action === 'approve'
          ? 'Project approved.'
          : action === 'resubmit'
            ? 'Sent back to the student for resubmission.'
            : 'Returned — the student will now pick from recommended projects.'
      );
      setProposals((prev) => prev.filter((p) => p.preferenceId !== selected.preferenceId));
      closeModal();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to record your decision');
    } finally {
      setDeciding(false);
    }
  };

  const textField = (label: string, value?: string) =>
    value ? (
      <div>
        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">{label}</p>
        <p className="text-gray-300 text-sm whitespace-pre-wrap">{value}</p>
      </div>
    ) : null;
  const listField = (label: string, values: string[]) =>
    values.length > 0 ? (
      <div>
        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">{label}</p>
        <p className="text-gray-300 text-sm">{values.join(', ')}</p>
      </div>
    ) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ClipboardCheck size={24} className="text-gold" />
          Project Proposals
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Review self-proposed projects submitted to you as a first preference before they can enter allocation.
        </p>
      </div>

      {loading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : proposals.length === 0 ? (
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-12 text-center">
          <ClipboardCheck size={40} className="mx-auto text-gray-600 mb-3" />
          <p className="text-gray-400">No proposals waiting on your review right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {proposals.map((proposal) => (
            <button
              key={proposal.preferenceId}
              onClick={() => setSelected(proposal)}
              className="w-full flex items-center justify-between gap-4 bg-zinc-850 border border-zinc-750 rounded-xl p-5 text-left hover:border-gold/50 hover:bg-zinc-800 transition-all duration-200 shadow-sm group"
            >
              <div className="min-w-0 space-y-2 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-white font-bold text-base group-hover:text-gold transition-colors truncate">{proposal.project.title}</p>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-gold/15 text-gold border border-gold/30 font-bold uppercase tracking-wider shrink-0">
                    {proposal.track}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-gray-400 text-xs flex-wrap">
                  <div className="flex items-center gap-1.5 text-gray-300">
                    <Users size={14} className="text-gold shrink-0" />
                    <span>{proposal.members.map((m) => m.fullName ?? 'Unknown').join(', ')}</span>
                  </div>
                  {proposal.submittedAt && (
                    <span className="text-gray-500">Submitted: {new Date(proposal.submittedAt).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-semibold text-gold bg-gold/10 px-3 py-1 rounded-lg border border-gold/20 group-hover:bg-gold group-hover:text-black transition-all">
                  Review Proposal
                </span>
                <ChevronRight size={18} className="text-gray-500 group-hover:text-gold transition-colors shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!selected} onClose={closeModal} title={selected?.project.title ?? 'Proposal'} size="xl">
        {detailLoading || !detail ? (
          <div className="min-h-[30vh] flex items-center justify-center">
            <SpinnerSquare size={40} />
          </div>
        ) : (
          <div className="space-y-6">
            {selected && (
              <div className="flex items-center gap-1.5 text-gray-400 text-xs -mt-2">
                <Users size={13} />
                {selected.members.map((m) => m.fullName ?? 'Unknown').join(', ')}
              </div>
            )}

            <div className="space-y-3">
              <p className="text-xs text-gold uppercase font-bold tracking-wider">Overview</p>
              {textField('Problem statement', detail.problemStatement)}
              {textField('Project description (short)', detail.projectDescription)}
              {textField('Description (detailed)', detail.description)}
              {textField('End users defined', detail.endUsersDefined)}
            </div>

            <div className="space-y-3">
              <p className="text-xs text-gold uppercase font-bold tracking-wider">Scope</p>
              {listField('Tech stack', detail.techStack)}
              {listField('Framework', detail.framework)}
              {listField('Suggested libraries', detail.suggestedLibrariesTools)}
              {listField('Course(s) covered', detail.courseCovered)}
              {listField('Core learning goals', detail.coreLearningGoals)}
              {textField('Industry', detail.industry)}
              {textField('Level', detail.level)}
              {textField('Theme', detail.theme)}
              {textField('Estimated duration (weeks)', detail.estimatedDuration ? String(detail.estimatedDuration) : undefined)}
            </div>

            <div className="space-y-3">
              <p className="text-xs text-gold uppercase font-bold tracking-wider">Features & evaluation</p>
              {listField('Must-have features', detail.mustHaveFeatures)}
              {listField('Good-to-have features', detail.goodToHaveFeatures)}
              {listField('Expected output', detail.expectedOutput)}
              {listField('Evaluation metrics', detail.evaluationMetrics)}
              {listField('Stretch goal', detail.stretchGoal)}
            </div>

            <div className="space-y-3">
              <p className="text-xs text-gold uppercase font-bold tracking-wider">Milestones</p>
              {listField('First month', detail.firstMonthMilestones)}
              {listField('Second month', detail.secondMonthMilestones)}
              {listField('Third month', detail.thirdMonthMilestones)}
            </div>

            {(detail.referenceDocs || detail.sourceStartupSchool) && (
              <div className="space-y-3">
                <p className="text-xs text-gold uppercase font-bold tracking-wider">Reference</p>
                {textField('Reference docs', detail.referenceDocs)}
                {textField('Source / Startup School', detail.sourceStartupSchool)}
              </div>
            )}

            {pendingAction ? (
              <div className="space-y-3 border-t border-zinc-800 pt-4">
                {pendingAction === 'return' && (
                  <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2.5 text-amber-300 text-xs">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>
                      The student won't be able to submit their own project again after this — they'll only be able
                      to pick a recommended project.
                    </span>
                  </div>
                )}
                <textarea
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder={
                    pendingAction === 'resubmit'
                      ? 'What needs to change? (required)'
                      : 'Why is this being returned to catalog selection? (required)'
                  }
                  rows={3}
                  autoFocus
                  className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold resize-none"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDecide(pendingAction)}
                    disabled={deciding || !actionNote.trim()}
                    className={`text-xs px-3 py-1.5 border font-semibold rounded-lg transition-colors disabled:opacity-50 ${
                      pendingAction === 'resubmit'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
                        : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                    }`}
                  >
                    {deciding ? 'Submitting...' : pendingAction === 'resubmit' ? 'Confirm Resubmit' : 'Confirm Return'}
                  </button>
                  <button
                    onClick={() => { setPendingAction(null); setActionNote(''); }}
                    disabled={deciding}
                    className="text-xs px-3 py-1.5 bg-zinc-750 text-gray-300 font-semibold rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 border-t border-zinc-800 pt-4">
                <button
                  onClick={() => handleDecide('approve')}
                  disabled={deciding}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 size={14} />
                  Approve
                </button>
                <button
                  onClick={() => setPendingAction('resubmit')}
                  disabled={deciding}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-zinc-750 text-gray-300 font-semibold rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
                >
                  <RotateCcw size={14} />
                  Resubmit
                </button>
                <button
                  onClick={() => setPendingAction('return')}
                  disabled={deciding}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 font-semibold rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  <Undo2 size={14} />
                  Return
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
