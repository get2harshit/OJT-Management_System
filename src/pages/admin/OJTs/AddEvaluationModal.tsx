import { useState, useEffect, useCallback, useMemo } from 'react';
import { ClipboardCheck, Plus, Minus, X } from 'lucide-react';
import Select from '../../../components/Select';
import SpinnerSquare from '../../../components/SpinnerSquare';
import EvaluationPanelGrid from './EvaluationPanelGrid';
import { isRowComplete, seatsOf, type PanelDraft } from '../../../lib/evaluationPanel';
import type { ApiMentor, EvaluationTypeTemplate, RubricTemplate, EvaluationMode, CriterionScorer } from '../../../lib/types';
import {
  apiListEvaluationTypes,
  apiCreateEvaluationType,
  apiListRubricTemplates,
  apiCreateRubricTemplate,
  apiCreateCohortEvaluationConfig,
  apiSetTeamPairings,
  apiSetMentorDefaultPairings,
  apiActivateCohortEvaluation,
  apiGetScopedTeams,
  type PanelTeam,
} from '../../../lib/api/evaluations';
import { apiGetCohortTrackConfig } from '../../../lib/api/tracks';
import { useToast } from '../../../toast';

interface CriterionDraft {
  name: string;
  maxMarks: string;
  scoredBy: CriterionScorer;
}

interface TrackOption {
  id: string;
  name: string;
  slug: string;
}

// Wizard-in-a-modal for setting up a new evaluation on this cohort, as three
// steps — who it's for (scope + window), who's judging it (panel size +
// pairings), what's being evaluated (type + rubric) — rather than one long
// scroll mixing all three together. Panel deliberately comes before rubric:
// an admin deciding which criteria are Panel vs Primary Only should already
// know whether a real secondary panel exists for this scope, not guess at it
// in the abstract. Every evaluation this modal creates is rubric-mode — a
// panel of at least the primary mentor, scoring named criteria — there is
// no separate "just one document, no panel" mode to choose between.
export function AddEvaluationModal({
  cohortId,
  cohortMentors,
  allowedBatches,
  onClose,
  onCreated,
}: {
  cohortId: string;
  cohortMentors: ApiMentor[];
  allowedBatches: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { showError, showSuccess } = useToast();
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [types, setTypes] = useState<EvaluationTypeTemplate[]>([]);

  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [creatingNewType, setCreatingNewType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

  const [rubrics, setRubrics] = useState<RubricTemplate[]>([]);
  const [loadingRubrics, setLoadingRubrics] = useState(false);
  const [selectedRubricId, setSelectedRubricId] = useState('');
  const [creatingNewRubric, setCreatingNewRubric] = useState(false);
  const [newRubricName, setNewRubricName] = useState('');
  // Declared before any criterion is added, so the admin commits to a total
  // up front rather than discovering what it added up to after the fact —
  // criteria below must sum to exactly this before Create & Activate unlocks.
  const [targetMaxMarks, setTargetMaxMarks] = useState('');
  const [criteriaDrafts, setCriteriaDrafts] = useState<CriterionDraft[]>([{ name: '', maxMarks: '', scoredBy: 'panel' }]);

  const [sequenceNo, setSequenceNo] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Scope: empty = every track / every batch, same as a config has always
  // meant before this. Track options come from this cohort's own track
  // config (deduped to one entry per track — evaluations scope by track,
  // not by the per-year variants that config can carry).
  const [trackOptions, setTrackOptions] = useState<TrackOption[]>([]);
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);

  // How many secondaries this evaluation is declared to have, on top of the
  // one fixed primary — starts at 0 (no panel declared yet) and is a
  // stepper, not free text, since it doubles as the column count for the
  // pairings grid below: every +/- click adds or drops a "Secondary N"
  // column for every row at once.
  const [secondaryEvaluatorCount, setSecondaryEvaluatorCount] = useState(0);
  // The panel grid: every team in the drafted scope with its primary mentor,
  // and the secondaries picked for each (plus each mentor's default for teams
  // that turn up later). Loaded when Step 2 opens, for the scope as it stands.
  const [scopedTeams, setScopedTeams] = useState<PanelTeam[]>([]);
  const [loadingScopedTeams, setLoadingScopedTeams] = useState(false);
  const [panelDraft, setPanelDraft] = useState<PanelDraft>({});
  const [panelDefaults, setPanelDefaults] = useState<PanelDraft>({});

  // What a failed submit already created, so a retry carries on from there
  // instead of creating a second config — which the overlap check would then
  // refuse, leaving the admin to delete the first by hand.
  const [created, setCreated] = useState<{ typeId?: string; rubricId?: string; configId?: string }>({});

  const [submitting, setSubmitting] = useState(false);

  // Three steps — what's being evaluated, who it's for, who's judging it —
  // shown one at a time instead of as one long scroll. Upload-mode types
  // have no panel to assemble (primary mentor only, no secondary pairing
  // concept at all), so their wizard is two steps, not three.
  const [step, setStep] = useState(1);

  useEffect(() => {
    (async () => {
      try {
        setTypes(await apiListEvaluationTypes());
      } catch (err: unknown) {
        showError(err instanceof Error ? err.message : 'Failed to load evaluation types');
      } finally {
        setLoadingTypes(false);
      }
    })();
  }, [showError]);

  useEffect(() => {
    (async () => {
      try {
        const configs = await apiGetCohortTrackConfig(cohortId);
        const byId = new Map<string, TrackOption>();
        for (const c of configs) byId.set(c.trackId, { id: c.trackId, name: c.trackName, slug: c.trackSlug });
        setTrackOptions(Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name)));
      } catch (err: unknown) {
        showError(err instanceof Error ? err.message : 'Failed to load tracks');
      }
    })();
  }, [cohortId, showError]);

  const scopeKey = `${selectedTrackIds.join(',')}|${selectedBatches.join(',')}`;
  useEffect(() => {
    if (step !== 2) return;
    let cancelled = false;
    setLoadingScopedTeams(true);
    apiGetScopedTeams(cohortId, { trackIds: selectedTrackIds, batches: selectedBatches })
      .then((teams) => {
        if (!cancelled) setScopedTeams(teams);
      })
      .catch((err: unknown) => showError(err instanceof Error ? err.message : 'Failed to load teams in scope'))
      .finally(() => {
        if (!cancelled) setLoadingScopedTeams(false);
      });
    return () => {
      cancelled = true;
    };
    // scopeKey stands in for the two arrays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, cohortId, scopeKey, showError]);

  const gridMentors = useMemo(
    () =>
      cohortMentors
        .map((m) => ({ id: m.id, name: m.fullName || m.email || 'Unnamed mentor' }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [cohortMentors]
  );

  // How much each secondary is taking on across the whole draft — the load
  // an admin balances while splitting.
  const secondaryLoad = useMemo(() => {
    const load = new Map<string, { teams: number; students: number }>();
    for (const team of scopedTeams) {
      for (const id of seatsOf(panelDraft[team.teamId], secondaryEvaluatorCount)) {
        if (!id) continue;
        const entry = load.get(id) ?? { teams: 0, students: 0 };
        entry.teams += 1;
        entry.students += team.studentCount;
        load.set(id, entry);
      }
    }
    return [...load.entries()]
      .map(([id, entry]) => ({ id, name: gridMentors.find((m) => m.id === id)?.name ?? 'Unknown', ...entry }))
      .sort((a, b) => b.students - a.students);
  }, [scopedTeams, panelDraft, secondaryEvaluatorCount, gridMentors]);

  const selectedType = creatingNewType
    ? { id: '', name: newTypeName, mode: 'rubric' as EvaluationMode }
    : types.find((t) => t.id === selectedTypeId);

  const loadRubrics = useCallback(async (typeId: string) => {
    setLoadingRubrics(true);
    setSelectedRubricId('');
    setCreatingNewRubric(false);
    try {
      const data = await apiListRubricTemplates(typeId);
      setRubrics(data);
      if (data.length === 0) setCreatingNewRubric(true);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to load rubrics');
    } finally {
      setLoadingRubrics(false);
    }
  }, [showError]);

  const handleSelectType = (id: string) => {
    if (id === '__new__') {
      setCreatingNewType(true);
      setSelectedTypeId('');
      setRubrics([]);
      setSelectedRubricId('');
      return;
    }
    setCreatingNewType(false);
    setSelectedTypeId(id);
    // Rubrics carry their own scoredBy tags, so they're always worth
    // loading now — even for an upload-mode type, whose existing rubrics
    // used to be permanently unreachable here (the picker only ever
    // fetched for 'rubric' mode, so every upload-mode evaluation forced a
    // brand new duplicate rubric).
    loadRubrics(id);
  };

  const addCriterionRow = () => setCriteriaDrafts((prev) => [...prev, { name: '', maxMarks: '', scoredBy: 'panel' }]);
  const removeCriterionRow = (index: number) =>
    setCriteriaDrafts((prev) => prev.filter((_, i) => i !== index));
  const updateCriterionRow = (index: number, field: 'name' | 'maxMarks', value: string) =>
    setCriteriaDrafts((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  const toggleCriterionScorer = (index: number) =>
    setCriteriaDrafts((prev) =>
      prev.map((c, i) => (i === index ? { ...c, scoredBy: c.scoredBy === 'panel' ? 'primary' : 'panel' } : c)),
    );

  // Step 1 (Target): a window, plus an explicit track and batch scope — no
  // more implicit "blank = everyone", so an admin can't accidentally
  // activate an evaluation cohort-wide by leaving a field empty.
  const targetValid = !!startDate && !!endDate && selectedTrackIds.length > 0 && selectedBatches.length > 0;

  // Step 2 (Mentor + Panel): with 0 secondaries there is nothing to pair.
  // Otherwise every team in scope needs every seat filled — a half-paired
  // panel would silently leave some students without a secondary.
  const incompleteTeamCount =
    secondaryEvaluatorCount === 0
      ? 0
      : scopedTeams.filter((t) => !isRowComplete(panelDraft[t.teamId], secondaryEvaluatorCount)).length;
  const panelValid = !loadingScopedTeams && incompleteTeamCount === 0;

  // With no secondary panelists at all, Panel vs Primary-only scoring is a
  // distinction without a difference — one scorer either way, so the split
  // changes neither the final mark nor what shows up in any report. Locking
  // the per-criterion toggle in that case (Step 3) saves the admin a choice
  // that has no effect, rather than letting them pick between two options
  // that behave identically here.
  const secondaryLocked = secondaryEvaluatorCount === 0;

  // The criteria below must sum to exactly this — set first, so the admin
  // commits to a total instead of discovering what it added up to after
  // the fact.
  const criteriaSum = criteriaDrafts.reduce((s, c) => s + (Number(c.maxMarks) || 0), 0);
  const targetMaxMarksValid = targetMaxMarks.trim() !== '' && Number(targetMaxMarks) > 0;
  const criteriaSumMatchesTarget = targetMaxMarksValid && criteriaSum === Number(targetMaxMarks);

  // Step 3 (Rubric): type picked (or named, if new) and its rubric fully
  // specified. This is also what the final Create & Activate gates on.
  const rubricValid =
    (creatingNewType ? newTypeName.trim().length > 0 : !!selectedTypeId) &&
    (creatingNewRubric
      ? newRubricName.trim().length > 0 &&
        criteriaDrafts.every((c) => c.name.trim() && Number(c.maxMarks) > 0) &&
        criteriaSumMatchesTarget
      : !!selectedRubricId);

  const totalSteps = 3;
  const stepTitles = ['Target', 'Mentor + Panel', 'Rubric'];

  const canSubmit = targetValid && panelValid && rubricValid;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // Each piece is created once; a retry after a later failure reuses it.
      let typeId = created.typeId ?? selectedTypeId;
      if (creatingNewType && !created.typeId) {
        typeId = (await apiCreateEvaluationType(newTypeName.trim(), 'rubric')).id;
        setCreated((c) => ({ ...c, typeId }));
      }

      let rubricId = created.rubricId ?? selectedRubricId;
      if (creatingNewRubric && !created.rubricId) {
        const criteria = criteriaDrafts.map((c) => ({ name: c.name.trim(), maxMarks: Number(c.maxMarks), scoredBy: c.scoredBy }));
        rubricId = (await apiCreateRubricTemplate(typeId, newRubricName.trim(), criteria)).id;
        setCreated((c) => ({ ...c, rubricId }));
      }

      let configId = created.configId;
      if (!configId) {
        const config = await apiCreateCohortEvaluationConfig({
          cohortId,
          evaluationTypeTemplateId: typeId,
          rubricTemplateId: rubricId,
          sequenceNo: sequenceNo ? Number(sequenceNo) : null,
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
          trackIds: selectedTrackIds,
          batches: selectedBatches,
          secondaryEvaluatorCount,
        });
        configId = config.id;
        setCreated((c) => ({ ...c, configId }));
      }

      if (secondaryEvaluatorCount > 0) {
        const seatsFor = (row: string[] | undefined) => seatsOf(row, secondaryEvaluatorCount).filter(Boolean);
        if (scopedTeams.length > 0) {
          await apiSetTeamPairings(
            configId,
            scopedTeams.map((t) => ({ teamId: t.teamId, secondaryMentorIds: seatsFor(panelDraft[t.teamId]) })),
          );
        }
        const defaults = Object.entries(panelDefaults)
          .map(([primaryMentorId, row]) => ({ primaryMentorId, secondaryMentorIds: seatsFor(row) }))
          .filter((d) => d.secondaryMentorIds.length > 0);
        if (defaults.length > 0) await apiSetMentorDefaultPairings(configId, defaults);
      }

      const result = await apiActivateCohortEvaluation(configId);
      const skippedTotal =
        result.skipped.alreadyAssigned + result.skipped.noMentor + result.skipped.noPublishedTeam + result.skipped.outOfScope;
      showSuccess(
        `Evaluation activated — assigned to ${result.newlyAssignedCount} student(s)` +
          (result.repairedCount > 0 ? `, repaired ${result.repairedCount}` : '') +
          (skippedTotal > 0 ? `, skipped ${skippedTotal} (not in scope, already assigned, or not ready)` : '') +
          (result.incompletePanel > 0 ? `. ${result.incompletePanel} got fewer secondaries than declared — fill them in Edit.` : '.'),
      );
      onCreated();
      onClose();
    } catch (err: unknown) {
      showError(
        (err instanceof Error ? err.message : 'Failed to set up evaluation') +
          (created.configId ? ' — the evaluation was created; submit again to finish setting it up.' : ''),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const goNext = () => setStep((s) => Math.min(s + 1, totalSteps));
  const goBack = () => setStep((s) => Math.max(s - 1, 1));
  const stepValid = step === 1 ? targetValid : step === 2 ? panelValid : rubricValid;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[80vw] max-w-5xl h-[80vh] overflow-y-auto bg-zinc-900 border border-zinc-750 rounded-2xl shadow-2xl p-6 mx-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <ClipboardCheck size={20} className="text-gold" />
            Add Evaluation
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Step indicator — three short, focused screens instead of one long
            scroll: what's being evaluated, who it's for, who's judging it. */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            {stepTitles.map((title, i) => {
              const n = i + 1;
              const state = n === step ? 'current' : n < step ? 'done' : 'upcoming';
              return (
                <div key={title} className="flex items-center gap-2 flex-1">
                  <div
                    className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold shrink-0 ${
                      state === 'done'
                        ? 'bg-gold text-black'
                        : state === 'current'
                          ? 'bg-gold/15 border border-gold text-gold'
                          : 'bg-zinc-800 border border-zinc-700 text-gray-500'
                    }`}
                  >
                    {n}
                  </div>
                  {i < stepTitles.length - 1 && (
                    <div className={`h-px flex-1 ${n < step ? 'bg-gold' : 'bg-zinc-800'}`} />
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            Step {step} of {totalSteps} — {stepTitles[step - 1]}
          </p>
        </div>

        <div className="space-y-5">
          {/* Step 1: who it's for — scope and window. */}
          {step === 1 && (
          <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                Tracks {selectedTrackIds.length === 0 && <span className="text-red-400">*</span>}
              </label>
              <Select
                isMulti
                value={selectedTrackIds}
                onChange={setSelectedTrackIds}
                placeholder="Select at least one track..."
                options={trackOptions.map((t) => ({ value: t.id, label: t.name }))}
                menuMinWidth={340}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                Batches {selectedBatches.length === 0 && <span className="text-red-400">*</span>}
              </label>
              <Select
                isMulti
                value={selectedBatches}
                onChange={setSelectedBatches}
                placeholder="Select at least one batch..."
                options={[...allowedBatches].sort().map((b) => ({ value: b, label: b }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const newStart = e.target.value;
                  // End date must always be after start date — if the
                  // already-picked end date no longer qualifies, clear it
                  // instead of leaving a silently-invalid value in place.
                  setStartDate(newStart);
                  if (endDate && newStart && new Date(endDate) <= new Date(newStart)) {
                    setEndDate('');
                  }
                }}
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
          </>
          )}

          {/* Step 2: who's judging — panel size, then each team's secondaries.
              Comes before Rubric on purpose: whether marking a criterion Panel
              means anything depends on whether a secondary panel exists. */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest whitespace-nowrap">
                  Secondary panelists
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSecondaryEvaluatorCount((c) => Math.max(0, c - 1))}
                    disabled={secondaryEvaluatorCount === 0 || !!created.configId}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 text-gray-300 hover:text-white hover:border-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-8 text-center text-sm font-semibold text-white tabular-nums">{secondaryEvaluatorCount}</span>
                  <button
                    type="button"
                    onClick={() => setSecondaryEvaluatorCount((c) => c + 1)}
                    disabled={!!created.configId}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 text-gray-300 hover:text-white hover:border-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <span className="text-[11px] text-gray-500">per student, on top of their own primary mentor</span>
              </div>

              {incompleteTeamCount > 0 && (
                <p className="text-[11px] text-amber-400/80">
                  {incompleteTeamCount} team{incompleteTeamCount === 1 ? '' : 's'} still {incompleteTeamCount === 1 ? 'has' : 'have'} an
                  empty secondary seat — fill every seat before continuing.
                </p>
              )}

              {loadingScopedTeams ? (
                <div className="py-10 flex justify-center">
                  <SpinnerSquare size={28} />
                </div>
              ) : (
                <EvaluationPanelGrid
                  secondaryCount={secondaryEvaluatorCount}
                  mentors={gridMentors}
                  teams={scopedTeams}
                  draft={panelDraft}
                  defaults={panelDefaults}
                  onDraftChange={setPanelDraft}
                  onDefaultsChange={setPanelDefaults}
                />
              )}

              {secondaryLoad.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {secondaryLoad.map((load) => (
                    <span key={load.id} className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-gray-300">
                      {load.name}: {load.teams} team{load.teams === 1 ? '' : 's'} · {load.students} student{load.students === 1 ? '' : 's'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: what's being evaluated — the type and its rubric. */}
          {step === 3 && (
          <>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Evaluation Type</label>
            {loadingTypes ? (
              <SpinnerSquare size={20} />
            ) : (
              <Select
                value={creatingNewType ? '__new__' : selectedTypeId}
                onChange={handleSelectType}
                placeholder="Select an evaluation type..."
                options={[...types.map((t) => ({ value: t.id, label: t.name })), { value: '__new__', label: '+ Create new type' }]}
              />
            )}
            {creatingNewType && (
              <div className="mt-3">
                <input
                  type="text"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  placeholder="e.g. Mid-term Review"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gold/40"
                />
              </div>
            )}
          </div>

          {selectedType && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Rubric</label>
              {!creatingNewType && loadingRubrics ? (
                <SpinnerSquare size={20} />
              ) : (
                <>
                  {!creatingNewRubric && (
                    <Select
                      value={selectedRubricId}
                      onChange={(v) => {
                        if (v === '__new__') { setCreatingNewRubric(true); setSelectedRubricId(''); }
                        else setSelectedRubricId(v);
                      }}
                      placeholder="Select an existing rubric..."
                      options={[
                        ...rubrics.map((r) => ({ value: r.id, label: `${r.name} — ${r.criteria.reduce((s, c) => s + c.maxMarks, 0)} marks` })),
                        { value: '__new__', label: '+ Create new rubric' },
                      ]}
                    />
                  )}
                  {creatingNewRubric && (
                    <div className="mt-3 space-y-3 p-3 bg-zinc-850 border border-zinc-800 rounded-lg">
                      {rubrics.length > 0 && (
                        <button
                          onClick={() => setCreatingNewRubric(false)}
                          className="text-xs text-gray-400 hover:text-white"
                        >
                          ← Use an existing rubric instead
                        </button>
                      )}
                      {secondaryLocked && (
                        <p className="text-[11px] text-gray-500">
                          Secondary panelists is 0 (set in Step 2) — Panel vs Primary only makes no difference here,
                          so the toggle below is locked. Add a secondary panelist there first if criteria need to
                          split.
                        </p>
                      )}
                      <input
                        type="text"
                        value={newRubricName}
                        onChange={(e) => setNewRubricName(e.target.value)}
                        placeholder="Rubric name, e.g. Viva Rubric v1"
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gold/40"
                      />
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-1">
                          Max marks for this rubric — criteria below must add up to exactly this
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={targetMaxMarks}
                          onChange={(e) => setTargetMaxMarks(e.target.value)}
                          placeholder="e.g. 70"
                          className="w-28 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gold/40"
                        />
                      </div>
                      <div className="space-y-2">
                        {criteriaDrafts.map((c, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={c.name}
                              onChange={(e) => updateCriterionRow(i, 'name', e.target.value)}
                              placeholder="Criterion name"
                              className="flex-1 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gold/40"
                            />
                            <input
                              type="number"
                              min={1}
                              value={c.maxMarks}
                              onChange={(e) => updateCriterionRow(i, 'maxMarks', e.target.value)}
                              placeholder="Marks"
                              className="w-20 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gold/40"
                            />
                            <button
                              type="button"
                              onClick={() => !secondaryLocked && toggleCriterionScorer(i)}
                              disabled={secondaryLocked}
                              title={
                                secondaryLocked
                                  ? 'No secondary panelists configured in Step 2 — every criterion is scored by the primary mentor alone regardless of this toggle'
                                  : "Who scores this — every panelist, or only the student's own mentor (for an artifact like a PRD or logbook nobody else saw)"
                              }
                              className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-1.5 rounded-lg border transition-colors ${
                                secondaryLocked
                                  ? 'bg-zinc-850 border-zinc-800 text-gray-600 cursor-not-allowed'
                                  : c.scoredBy === 'primary'
                                  ? 'bg-gold/10 border-gold/40 text-gold'
                                  : 'bg-zinc-800 border-zinc-700 text-gray-400 hover:text-gray-300'
                              }`}
                            >
                              {secondaryLocked ? 'Scored solo' : c.scoredBy === 'primary' ? 'Primary only' : 'Panel'}
                            </button>
                            {criteriaDrafts.length > 1 && (
                              <button onClick={() => removeCriterionRow(i)} className="text-gray-500 hover:text-red-400">
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <button onClick={addCriterionRow} className="text-xs text-gold hover:text-gold-hover flex items-center gap-1">
                          <Plus size={12} /> Add criterion
                        </button>
                      </div>
                      <p
                        className={`text-[11px] font-medium ${
                          !targetMaxMarksValid
                            ? 'text-gray-500'
                            : criteriaSumMatchesTarget
                            ? 'text-green-500'
                            : 'text-amber-400'
                        }`}
                      >
                        {targetMaxMarksValid
                          ? criteriaSumMatchesTarget
                            ? `${criteriaSum} / ${targetMaxMarks} marks — matches the target`
                            : `${criteriaSum} / ${targetMaxMarks} marks — must total exactly ${targetMaxMarks} before this can be created`
                          : `${criteriaSum} marks so far — set a target above first`}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
              Sequence <span className="normal-case text-gray-600">(e.g. Viva 1/2/3)</span>
            </label>
            <input
              type="number"
              min={1}
              value={sequenceNo}
              onChange={(e) => setSequenceNo(e.target.value)}
              placeholder="Optional"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
          </div>
          </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 mt-6 pt-3 border-t border-zinc-800">
          <div>
            {step > 1 && (
              <button
                onClick={goBack}
                className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white bg-zinc-800 hover:bg-zinc-750 rounded-lg border border-zinc-700 transition-colors"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white bg-zinc-800 hover:bg-zinc-750 rounded-lg border border-zinc-700 transition-colors"
            >
              Cancel
            </button>
            {step < totalSteps ? (
              <button
                onClick={goNext}
                disabled={!stepValid}
                className="px-5 py-2 text-sm font-semibold text-black bg-gold hover:bg-gold-hover rounded-lg shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="px-5 py-2 text-sm font-semibold text-black bg-gold hover:bg-gold-hover rounded-lg shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed"
              >
                {submitting ? 'Activating...' : 'Create & Activate'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
