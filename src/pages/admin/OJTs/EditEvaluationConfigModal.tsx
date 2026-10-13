import { useState, useEffect, useCallback, useMemo } from 'react';
import { Pencil, X, Minus, Plus } from 'lucide-react';
import type { ApiMentor, CohortEvaluationConfig } from '../../../lib/types';
import {
  apiUpdateCohortEvaluationConfig,
  apiGetConfigPanel,
  apiSetTeamPairings,
  apiSetMentorDefaultPairings,
  type ConfigPanelTeam,
} from '../../../lib/api/evaluations';
import SpinnerSquare from '../../../components/SpinnerSquare';
import EvaluationPanelGrid from './EvaluationPanelGrid';
import { isRowComplete, seatsOf, type PanelDraft } from '../../../lib/evaluationPanel';
import { useToast } from '../../../toast';

/**
 * Only what stays editable no matter what — dates, panel size, and who sits
 * on each team's panel. Everything structural (type, rubric, sequence,
 * track/batch scope) locks once any student is assigned, since changing it in
 * place would desync existing evaluation rows from what the config claims to
 * be; delete and recreate is the path for that, and the server says so.
 *
 * The panel is the same sheet the Add wizard uses. Saving a team's row also
 * brings its existing evaluations in line: a removed secondary leaves only if
 * they have not scored, and a new one joins only students nobody has scored
 * yet — a given mark, and a finished result, are never moved.
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
  const isRubric = config.evaluationTypeTemplate.mode === 'rubric';
  const [startDate, setStartDate] = useState(config.startDate.slice(0, 10));
  const [endDate, setEndDate] = useState(config.endDate.slice(0, 10));
  const [secondaryCount, setSecondaryCount] = useState(config.secondaryEvaluatorCount);
  const [submitting, setSubmitting] = useState(false);

  const [teams, setTeams] = useState<ConfigPanelTeam[]>([]);
  const [loadingPanel, setLoadingPanel] = useState(isRubric);
  const [draft, setDraft] = useState<PanelDraft>({});
  const [defaults, setDefaults] = useState<PanelDraft>({});
  // What the server holds, to send only what actually changed.
  const [savedDraft, setSavedDraft] = useState<PanelDraft>({});
  const [savedDefaults, setSavedDefaults] = useState<PanelDraft>({});

  const loadPanel = useCallback(async () => {
    if (!isRubric) return;
    setLoadingPanel(true);
    try {
      const panel = await apiGetConfigPanel(config.id);
      const teamRows: PanelDraft = Object.fromEntries(panel.teams.map((t) => [t.teamId, t.secondaryMentorIds]));
      const defaultRows: PanelDraft = Object.fromEntries(panel.mentorDefaults.map((d) => [d.primaryMentorId, d.secondaryMentorIds]));
      setTeams(panel.teams);
      setDraft(teamRows);
      setSavedDraft(teamRows);
      setDefaults(defaultRows);
      setSavedDefaults(defaultRows);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to load the panel');
    } finally {
      setLoadingPanel(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.id, isRubric]);

  useEffect(() => {
    loadPanel();
  }, [loadPanel]);

  const gridMentors = useMemo(
    () =>
      cohortMentors
        .map((m) => ({ id: m.id, name: m.fullName || m.email || 'Unnamed mentor' }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [cohortMentors]
  );

  /** A row as the server will hold it: filled seats only, up to the panel size. */
  const normalised = (row: string[] | undefined) => seatsOf(row, secondaryCount).filter(Boolean);
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));

  const changedTeams = teams.filter((t) => !sameSet(normalised(draft[t.teamId]), (savedDraft[t.teamId] ?? []).slice(0, secondaryCount)));
  const changedDefaults = Object.keys({ ...defaults, ...savedDefaults }).filter(
    (primaryMentorId) => !sameSet(normalised(defaults[primaryMentorId]), savedDefaults[primaryMentorId] ?? [])
  );
  const incompleteTeamCount = secondaryCount === 0 ? 0 : teams.filter((t) => !isRowComplete(draft[t.teamId], secondaryCount)).length;

  const datesValid = !!startDate && !!endDate && new Date(startDate) < new Date(endDate);

  const handleSubmit = async () => {
    if (!datesValid) return;
    setSubmitting(true);
    try {
      // The config first: the server checks each team's secondaries against
      // the panel size it holds, so a raised count has to land before them.
      await apiUpdateCohortEvaluationConfig(config.id, {
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        secondaryEvaluatorCount: secondaryCount,
      });

      const notes: string[] = [];
      if (isRubric && changedTeams.length > 0) {
        const result = await apiSetTeamPairings(
          config.id,
          changedTeams.map((t) => ({ teamId: t.teamId, secondaryMentorIds: normalised(draft[t.teamId]) }))
        );
        notes.push(`${changedTeams.length} team${changedTeams.length === 1 ? '' : 's'} updated`);
        if (result.seatedCount > 0) notes.push(`${result.seatedCount} secondary seat(s) added`);
        if (result.removedCount > 0) notes.push(`${result.removedCount} removed`);
        if (result.keptScoredCount > 0) notes.push(`${result.keptScoredCount} kept (already scored)`);
        if (result.lockedEvaluationCount > 0) notes.push(`${result.lockedEvaluationCount} student(s) already scored, left as they are`);
      }
      if (isRubric && changedDefaults.length > 0) {
        await apiSetMentorDefaultPairings(
          config.id,
          changedDefaults.map((primaryMentorId) => ({ primaryMentorId, secondaryMentorIds: normalised(defaults[primaryMentorId]) }))
        );
      }

      showSuccess(notes.length > 0 ? `Evaluation updated — ${notes.join(', ')}.` : 'Evaluation updated.');
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
      <div className="relative w-[80vw] max-w-5xl max-h-[85vh] overflow-y-auto bg-zinc-900 border border-zinc-750 rounded-2xl shadow-2xl p-6 mx-4 animate-in fade-in zoom-in-95 duration-200">
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
          Type, rubric, sequence and scope can't change once students are assigned — dates, panel size and each team's
          secondaries always can. A changed secondary reaches only students nobody has scored yet.
        </p>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
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
            {isRubric && (
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Secondary Panelists</label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSecondaryCount((c) => Math.max(0, c - 1))}
                    disabled={secondaryCount === 0}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 text-gray-300 hover:text-white disabled:opacity-40"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-8 text-center text-sm font-semibold text-white tabular-nums">{secondaryCount}</span>
                  <button
                    type="button"
                    onClick={() => setSecondaryCount((c) => c + 1)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 text-gray-300 hover:text-white"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {isRubric && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest">Panel</label>
              {incompleteTeamCount > 0 && (
                <p className="text-[11px] text-amber-400/80">
                  {incompleteTeamCount} team{incompleteTeamCount === 1 ? '' : 's'} with an empty secondary seat — their students are
                  scored with fewer secondaries until it is filled.
                </p>
              )}
              {loadingPanel ? (
                <div className="py-10 flex justify-center">
                  <SpinnerSquare size={28} />
                </div>
              ) : (
                <EvaluationPanelGrid
                  secondaryCount={secondaryCount}
                  mentors={gridMentors}
                  teams={teams}
                  draft={draft}
                  defaults={defaults}
                  onDraftChange={setDraft}
                  onDefaultsChange={setDefaults}
                />
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 mt-5 pt-3 border-t border-zinc-800">
          {changedTeams.length > 0 && (
            <span className="mr-auto text-[11px] text-gold">
              {changedTeams.length} team{changedTeams.length === 1 ? '' : 's'} changed
            </span>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white bg-zinc-800 hover:bg-zinc-750 rounded-lg border border-zinc-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!datesValid || submitting || loadingPanel}
            className="px-5 py-2 text-sm font-semibold text-black bg-gold hover:bg-gold-hover rounded-lg shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
