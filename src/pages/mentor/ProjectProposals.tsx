import { useState, useEffect, useCallback } from 'react';
import { ClipboardCheck, CheckCircle2, XCircle, Users } from 'lucide-react';
import SpinnerSquare from '../../components/SpinnerSquare';
import type { PendingProposal } from '../../lib/types';
import { apiGetPendingProposals, apiDecideOnProposal } from '../../lib/api';
import { useToast } from '../../toast';

export default function ProjectProposals() {
  const { showError, showSuccess } = useToast();

  const [proposals, setProposals] = useState<PendingProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

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

  const handleApprove = async (preferenceId: string) => {
    setDecidingId(preferenceId);
    try {
      await apiDecideOnProposal(preferenceId, 'approve');
      showSuccess('Project approved.');
      setProposals((prev) => prev.filter((p) => p.preferenceId !== preferenceId));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to approve this proposal');
    } finally {
      setDecidingId(null);
    }
  };

  const handleConfirmReject = async (preferenceId: string) => {
    setDecidingId(preferenceId);
    try {
      await apiDecideOnProposal(preferenceId, 'reject', rejectNote.trim() || undefined);
      showSuccess('Project rejected.');
      setProposals((prev) => prev.filter((p) => p.preferenceId !== preferenceId));
      setRejectingId(null);
      setRejectNote('');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to reject this proposal');
    } finally {
      setDecidingId(null);
    }
  };

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {proposals.map((proposal) => {
            const isDeciding = decidingId === proposal.preferenceId;
            const isRejecting = rejectingId === proposal.preferenceId;

            return (
              <div
                key={proposal.preferenceId}
                className="bg-zinc-850 border border-zinc-750 rounded-xl p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-white font-semibold">{proposal.project.title}</h2>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-gold/10 text-gold font-medium mt-1 inline-block">
                      {proposal.track}
                    </span>
                  </div>
                </div>

                {proposal.project.description && (
                  <p className="text-gray-400 text-sm">{proposal.project.description}</p>
                )}
                {proposal.project.problemStatement && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Problem statement</p>
                    <p className="text-gray-300 text-sm">{proposal.project.problemStatement}</p>
                  </div>
                )}
                {proposal.project.techStack.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {proposal.project.techStack.map((tech) => (
                      <span key={tech} className="text-xs px-2 py-1 rounded-md bg-zinc-750 text-gray-300">
                        {tech}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1.5 text-gray-400 text-xs">
                  <Users size={14} />
                  {proposal.members.map((m) => m.fullName ?? 'Unknown').join(', ')}
                </div>

                {isRejecting ? (
                  <div className="space-y-2 pt-1">
                    <textarea
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      placeholder="Reason for rejection (optional)"
                      rows={2}
                      className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold resize-none"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleConfirmReject(proposal.preferenceId)}
                        disabled={isDeciding}
                        className="text-xs px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 font-semibold rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
                      >
                        {isDeciding ? 'Rejecting...' : 'Confirm Reject'}
                      </button>
                      <button
                        onClick={() => { setRejectingId(null); setRejectNote(''); }}
                        disabled={isDeciding}
                        className="text-xs px-3 py-1.5 bg-zinc-750 text-gray-300 font-semibold rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleApprove(proposal.preferenceId)}
                      disabled={isDeciding}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
                    >
                      <CheckCircle2 size={14} />
                      Approve
                    </button>
                    <button
                      onClick={() => setRejectingId(proposal.preferenceId)}
                      disabled={isDeciding}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-zinc-750 text-gray-300 font-semibold rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
                    >
                      <XCircle size={14} />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
