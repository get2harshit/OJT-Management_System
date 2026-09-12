import { useState, useEffect } from 'react';
import { Eye, X, ClipboardList, Users2, ArrowRight } from 'lucide-react';
import type { ApiMentor, CohortEvaluationConfig } from '../../../lib/types';
import { apiGetMentorPairings, apiGetMentorWorkload, type MentorWorkload } from '../../../lib/api/evaluations';
import { formatDateDisplay } from '../../../lib/utils';
import { useToast } from '../../../toast';
import SpinnerSquare from '../../../components/SpinnerSquare';

const MODE_LABELS: Record<string, string> = { upload: 'Upload', rubric: 'Rubric' };

/**
 * Read-only counterpart to EditEvaluationConfigModal — everything about one
 * configured evaluation in one place: its rubric (what's being scored, by
 * whom), and its mentor pairings (who's paired with whom), neither of which
 * the Configured Evaluations table's own columns show. No mutation path
 * here at all; Edit is the button for that.
 */
export function ViewEvaluationConfigModal({
  config,
  cohortMentors,
  onClose,
}: {
  config: CohortEvaluationConfig;
  cohortMentors: ApiMentor[];
  onClose: () => void;
}) {
  const { showError } = useToast();
  const [pairingsByPrimary, setPairingsByPrimary] = useState<Record<string, string[]>>({});
  const [workload, setWorkload] = useState<MentorWorkload[]>([]);
  const [loadingPairings, setLoadingPairings] = useState(true);

  useEffect(() => {
    (async () => {
      setLoadingPairings(true);
      try {
        const [pairings, workloadRows] = await Promise.all([
          apiGetMentorPairings(config.id),
          apiGetMentorWorkload(config.cohortId),
        ]);
        const byPrimary: Record<string, string[]> = {};
        for (const p of pairings) {
          (byPrimary[p.primaryMentorId] ??= []).push(p.secondaryMentorId);
        }
        setPairingsByPrimary(byPrimary);
        setWorkload(workloadRows);
      } catch (err: unknown) {
        showError(err instanceof Error ? err.message : 'Failed to load mentor pairings');
      } finally {
        setLoadingPairings(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.id, config.cohortId]);

  const mentorById = new Map(cohortMentors.map((m) => [m.id, m]));
  const mentorLabel = (id: string) => mentorById.get(id)?.fullName || mentorById.get(id)?.email || 'Unknown';
  const workloadByMentorId = new Map(workload.map((w) => [w.mentorId, w]));

  const evaluationName = config.sequenceNo
    ? `${config.evaluationTypeTemplate.name} ${config.sequenceNo}`
    : config.evaluationTypeTemplate.name;

  const primaries = Object.keys(pairingsByPrimary);
  const totalMarks = config.rubricTemplate.criteria.reduce((sum, c) => sum + c.maxMarks, 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[80vw] max-w-5xl h-[80vh] flex flex-col bg-zinc-900 border border-zinc-750 rounded-2xl shadow-2xl mx-4 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-gold/50 via-gold to-gold/50 shrink-0" />

        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-1 shrink-0">
          <h3 className="text-lg font-bold text-white flex items-center gap-2 min-w-0">
            <Eye size={17} className="text-gold shrink-0" />
            <span className="truncate">{evaluationName}</span>
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                config.isActive ? 'bg-green-500/10 text-green-500' : 'bg-zinc-800 text-gray-400'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${config.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
              {config.isActive ? 'Active' : 'Draft'}
            </span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gold/10 text-gold">
              {MODE_LABELS[config.evaluationTypeTemplate.mode] ?? config.evaluationTypeTemplate.mode}
            </span>
            <span className="text-[11px] text-gray-500">
              {formatDateDisplay(config.startDate)} → {formatDateDisplay(config.endDate)}
            </span>
          </div>

          <div className="mb-5">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1.5">Audience</p>
            {config.scope.trackNames.length === 0 && config.scope.batches.length === 0 ? (
              <p className="text-xs text-gray-300">All students</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {config.scope.trackNames.map((name) => (
                  <span
                    key={name}
                    className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-gold/10 text-gold border border-gold/30"
                  >
                    {name}
                  </span>
                ))}
                {config.scope.batches.map((batch) => (
                  <span
                    key={batch}
                    className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-zinc-800 text-gray-300 border border-zinc-700"
                  >
                    {batch}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-5">
            <div className="rounded-lg bg-zinc-800/60 border border-zinc-750 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Max Marks</p>
              <p className="text-lg font-bold text-white tabular-nums">{config.maxMarksSnapshot}</p>
            </div>
            <div className="rounded-lg bg-zinc-800/60 border border-zinc-750 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Criteria</p>
              <p className="text-lg font-bold text-white tabular-nums">{config.rubricTemplate.criteria.length}</p>
            </div>
            <div className="rounded-lg bg-zinc-800/60 border border-zinc-750 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Secondary Panelists</p>
              <p className="text-lg font-bold text-gold tabular-nums">{config.secondaryEvaluatorCount}</p>
            </div>
            <div className="rounded-lg bg-zinc-800/60 border border-zinc-750 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Total Marks</p>
              <p className="text-lg font-bold text-white tabular-nums">{totalMarks}</p>
            </div>
            <div className="rounded-lg bg-zinc-800/60 border border-zinc-750 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Primaries Paired</p>
              <p className="text-lg font-bold text-white tabular-nums">{primaries.length}</p>
            </div>
            <div className="rounded-lg bg-zinc-800/60 border border-zinc-750 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Sequence</p>
              <p className="text-lg font-bold text-white tabular-nums">{config.sequenceNo ?? '—'}</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1.5 flex items-center gap-1.5">
                <ClipboardList size={12} className="text-gray-600" />
                Rubric — {config.rubricTemplate.name}
              </p>
              <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800 overflow-hidden">
                {config.rubricTemplate.criteria.map((c) => (
                  <div key={c.id} className="px-3 py-2 flex items-center justify-between gap-3 hover:bg-zinc-850 transition-colors">
                    <span className="text-xs text-gray-200 truncate">{c.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-400 tabular-nums">{c.maxMarks} marks</span>
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                          c.scoredBy === 'primary'
                            ? 'bg-gold/10 border-gold/40 text-gold'
                            : 'bg-zinc-800 border-zinc-700 text-gray-400'
                        }`}
                      >
                        {c.scoredBy === 'primary' ? 'Primary only' : 'Panel'}
                      </span>
                    </div>
                  </div>
                ))}
                <div className="px-3 py-1.5 flex items-center justify-end bg-zinc-850/60">
                  <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                    Total <span className="text-gray-300 tabular-nums">{totalMarks} marks</span>
                  </span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1.5 flex items-center gap-1.5">
                <Users2 size={12} className="text-gray-600" />
                Mentor Pairings
              </p>
              {loadingPairings ? (
                <div className="flex justify-center py-4">
                  <SpinnerSquare size={20} />
                </div>
              ) : primaries.length === 0 ? (
                <p className="text-[11px] text-gray-500 rounded-lg border border-dashed border-zinc-800 px-3 py-3 text-center">
                  No pairings declared — every in-scope student is scored by their primary mentor alone.
                </p>
              ) : (
                <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800 overflow-hidden max-h-72 overflow-y-auto">
                  {primaries.map((primaryId) => {
                    const w = workloadByMentorId.get(primaryId);
                    return (
                      <div key={primaryId} className="px-3 py-2 flex items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span className="text-xs font-medium text-white shrink-0">{mentorLabel(primaryId)}</span>
                          <ArrowRight size={11} className="text-gray-600 shrink-0" />
                          <div className="flex flex-wrap gap-1.5">
                            {pairingsByPrimary[primaryId].map((secId) => (
                              <span
                                key={secId}
                                className="text-xs text-gold bg-gold/10 border border-gold/30 rounded-md px-2 py-0.5"
                              >
                                {mentorLabel(secId)}
                              </span>
                            ))}
                          </div>
                        </div>
                        {w && (
                          <span className="shrink-0 text-[10px] text-gray-500 bg-zinc-800/60 border border-zinc-750 rounded px-1.5 py-0.5 tabular-nums">
                            {w.teamCount} team{w.teamCount === 1 ? '' : 's'} · {w.studentCount} student
                            {w.studentCount === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end px-6 py-3 border-t border-zinc-800 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white bg-zinc-800 hover:bg-zinc-750 rounded-lg border border-zinc-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
