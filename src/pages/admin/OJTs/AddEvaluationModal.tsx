import { useState, useEffect, useCallback } from 'react';
import { ClipboardCheck, Plus, Minus, X } from 'lucide-react';
import Select from '../../../components/Select';
import SpinnerSquare from '../../../components/SpinnerSquare';
import { MentorPickerPanel } from './MentorPickerPanel';
import type { ApiMentor, EvaluationTypeTemplate, RubricTemplate, EvaluationMode, CriterionScorer } from '../../../lib/types';
import {
  apiListEvaluationTypes,
  apiCreateEvaluationType,
  apiListRubricTemplates,
  apiCreateRubricTemplate,
  apiCreateCohortEvaluationConfig,
  apiSetMentorPairings,
  apiActivateCohortEvaluation,
  apiGetMentorPanelLoad,
  apiGetMentorsByTrack,
  apiGetMentorWorkload,
  type MentorPanelLoad,
  type MentorWorkload,
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

// trackId -> ids of mentors who actually have a student allocated in that
// track right now (see apiGetMentorsByTrack) — not who's merely staffed for
// it, which would still list a mentor with nobody assigned to them yet.
type TrackMentorIndex = Map<string, Set<string>>;

// Wizard-in-a-modal for setting up a new evaluation on this cohort, as three
// steps — who it's for (scope + window), who's judging it (panel size +
// pairings), what's being evaluated (type + rubric) — rather than one long
// scroll mixing all three together. Panel deliberately comes before rubric:
// an admin deciding which criteria are Panel vs Internal Only should already
// know whether a real external panel exists for this scope, not guess at it
// in the abstract. Every evaluation this modal creates is rubric-mode — a
// panel of at least the internal mentor, scoring named criteria — there is
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
  const [criteriaDrafts, setCriteriaDrafts] = useState<CriterionDraft[]>([{ name: '', maxMarks: '', scoredBy: 'panel' }]);

  const [sequenceNo, setSequenceNo] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Scope: empty = every track / every batch, same as a config has always
  // meant before this. Track options come from this cohort's own track
  // config (deduped to one entry per track — evaluations scope by track,
  // not by the per-year variants that config can carry).
  const [trackOptions, setTrackOptions] = useState<TrackOption[]>([]);
  const [trackMentorIndex, setTrackMentorIndex] = useState<TrackMentorIndex>(new Map());
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);

  // How many externals this evaluation is declared to have, on top of the
  // one fixed internal — starts at 0 (no panel declared yet) and is a
  // stepper, not free text, since it doubles as the column count for the
  // pairings grid below: every +/- click adds or drops an "External N"
  // column for every row at once.
  const [externalEvaluatorCount, setExternalEvaluatorCount] = useState(0);
  // One internal mentor -> up to externalEvaluatorCount externals, indexed
  // by column position (pairings[mentorId][0] is that row's "External 1",
  // etc.) — not just an unordered set, since each column is its own slot.
  const [pairings, setPairings] = useState<Record<string, string[]>>({});
  // Which grid cell's picker drawer is currently open, if any.
  const [pickerTarget, setPickerTarget] = useState<{ internalMentorId: string; columnIndex: number } | null>(null);

  // Existing committed load only — this config's own picks below aren't
  // counted here since they don't exist as real panelist rows yet, which
  // is exactly why the projection below adds them back in on top.
  const [panelLoad, setPanelLoad] = useState<MentorPanelLoad[]>([]);
  // Each mentor's real current team/student load in this cohort — shown next
  // to their row so an admin can see who's actually mentoring whom without
  // leaving the modal.
  const [mentorWorkload, setMentorWorkload] = useState<MentorWorkload[]>([]);

  const [submitting, setSubmitting] = useState(false);

  // Three steps — what's being evaluated, who it's for, who's judging it —
  // shown one at a time instead of as one long scroll. Upload-mode types
  // have no panel to assemble (internal mentor only, no external pairing
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

  useEffect(() => {
    (async () => {
      try {
        setPanelLoad(await apiGetMentorPanelLoad(cohortId));
      } catch (err: unknown) {
        showError(err instanceof Error ? err.message : 'Failed to load mentor panel load');
      }
    })();
  }, [cohortId, showError]);

  useEffect(() => {
    (async () => {
      try {
        setMentorWorkload(await apiGetMentorWorkload(cohortId));
      } catch (err: unknown) {
        showError(err instanceof Error ? err.message : 'Failed to load mentor workload');
      }
    })();
  }, [cohortId, showError]);

  // Live-allocation based (which mentor actually has a student whose team is
  // in each track right now) — deliberately not the track-config staffing
  // roster, which would also list a mentor with nobody assigned to them yet.
  useEffect(() => {
    (async () => {
      try {
        const rows = await apiGetMentorsByTrack(cohortId);
        setTrackMentorIndex(new Map(rows.map((r) => [r.trackId, new Set(r.mentorIds)])));
      } catch (err: unknown) {
        showError(err instanceof Error ? err.message : 'Failed to load which mentors have students in each track');
      }
    })();
  }, [cohortId, showError]);

  // Existing load, plus what this form's own draft pairings would add —
  // composed here rather than asked of the server, since these picks don't
  // exist as real panelist rows until the config is actually created.
  const projectedExternalCounts = (() => {
    const counts = new Map<string, number>();
    for (const externalIds of Object.values(pairings)) {
      for (const id of externalIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  })();

  const trackNameBySlug = new Map(trackOptions.map((t) => [t.slug, t.name]));
  // mentor_workload's trackIds are real track UUIDs (off ojt_teams.track_id),
  // not the slug ApiMentor.tracks carries — a separate lookup, keyed by id
  // for that reason, from trackNameBySlug above.
  const trackNameById = new Map(trackOptions.map((t) => [t.id, t.name]));
  const workloadByMentorId = new Map(mentorWorkload.map((w) => [w.mentorId, w]));

  // Whose slot the picker drawer is currently filling — shown in its header
  // so it's never ambiguous which row's "Add" was clicked.
  const pickerInternalMentor = pickerTarget
    ? cohortMentors.find((m) => m.id === pickerTarget.internalMentorId)
    : undefined;
  const pickerInternalMentorName = pickerInternalMentor?.fullName || pickerInternalMentor?.email || '';
  const pickerInternalMentorWorkload = pickerTarget ? workloadByMentorId.get(pickerTarget.internalMentorId) : undefined;
  const pickerInternalMentorTrackNames = (pickerInternalMentorWorkload?.trackIds ?? []).map(
    (id) => trackNameById.get(id) ?? id,
  );

  // Existing panel-load badge — external commitments only (how loaded this
  // mentor already is as an EXTERNAL panelist elsewhere). Their own-student
  // count lives in the workload line above it instead, so it isn't repeated
  // here.
  const loadBadge = (mentorId: string) => {
    const existing = panelLoad.find((l) => l.mentorId === mentorId);
    const existingExternal = existing?.externalStudentCount ?? 0;
    const projected = projectedExternalCounts.get(mentorId) ?? 0;
    if (existingExternal === 0 && projected === 0) return null;
    return `${existingExternal}${projected > 0 ? `+${projected}` : ''} ext`;
  };

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
  // Shortcuts for the two artifact criteria every viva reaches for — a
  // reviewed document (PRD, OJL logbook, ...) or attendance — pre-toggled to
  // Internal Only since nobody but the student's own mentor ever saw either
  // one. Document keeps the name blank (which document varies); Attendance
  // never does, since it's always exactly that.
  const addDocumentCriterionRow = () =>
    setCriteriaDrafts((prev) => [...prev, { name: '', maxMarks: '', scoredBy: 'internal' }]);
  const addAttendanceCriterionRow = () =>
    setCriteriaDrafts((prev) => [...prev, { name: 'Attendance', maxMarks: '', scoredBy: 'internal' }]);
  const removeCriterionRow = (index: number) =>
    setCriteriaDrafts((prev) => prev.filter((_, i) => i !== index));
  const updateCriterionRow = (index: number, field: 'name' | 'maxMarks', value: string) =>
    setCriteriaDrafts((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  const toggleCriterionScorer = (index: number) =>
    setCriteriaDrafts((prev) =>
      prev.map((c, i) => (i === index ? { ...c, scoredBy: c.scoredBy === 'panel' ? 'internal' : 'panel' } : c)),
    );

  // Which mentors get a pairing row: everyone when the scope is every track
  // (blank), otherwise only mentors who actually have an allocated student
  // in at least one selected track right now — an internal mentor with no
  // student in scope is never going to be this config's automatic internal
  // for anyone, so listing them here is just noise to scroll past. The
  // MentorPickerPanel's own candidate list stays unfiltered by track — an
  // external panelist is deliberately allowed to come from outside it.
  const pairingRowMentors =
    selectedTrackIds.length === 0
      ? cohortMentors
      : cohortMentors.filter((m) => selectedTrackIds.some((trackId) => trackMentorIndex.get(trackId)?.has(m.id)));

  // Step 1 (Target): a window is the one thing every evaluation needs before
  // anything downstream makes sense — scope can stay blank (= everyone).
  const targetValid = !!startDate && !!endDate;

  // Step 2 (Mentor + Panel): everything here is optional — a declared panel
  // size with nobody paired yet is a legitimate, if incomplete, state to
  // move on from.
  const panelValid = true;

  // Step 3 (Rubric): type picked (or named, if new) and its rubric fully
  // specified. This is also what the final Create & Activate gates on.
  const rubricValid =
    (creatingNewType ? newTypeName.trim().length > 0 : !!selectedTypeId) &&
    (creatingNewRubric
      ? newRubricName.trim().length > 0 && criteriaDrafts.every((c) => c.name.trim() && Number(c.maxMarks) > 0)
      : !!selectedRubricId);

  const totalSteps = 3;
  const stepTitles = ['Target', 'Mentor + Panel', 'Rubric'];

  const canSubmit = targetValid && panelValid && rubricValid;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      let typeId = selectedTypeId;
      if (creatingNewType) {
        const created = await apiCreateEvaluationType(newTypeName.trim(), 'rubric');
        typeId = created.id;
      }

      let rubricId = selectedRubricId;
      if (creatingNewRubric) {
        const criteria = criteriaDrafts.map((c) => ({ name: c.name.trim(), maxMarks: Number(c.maxMarks), scoredBy: c.scoredBy }));
        const created = await apiCreateRubricTemplate(typeId, newRubricName.trim(), criteria);
        rubricId = created.id;
      }

      const config = await apiCreateCohortEvaluationConfig({
        cohortId,
        evaluationTypeTemplateId: typeId,
        rubricTemplateId: rubricId,
        sequenceNo: sequenceNo ? Number(sequenceNo) : null,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        trackIds: selectedTrackIds,
        batches: selectedBatches,
        externalEvaluatorCount,
      });

      const pairingEntries = Object.entries(pairings).flatMap(([internalMentorId, externalIds]) =>
        externalIds.filter(Boolean).map((externalMentorId) => ({ internalMentorId, externalMentorId })),
      );
      if (pairingEntries.length > 0) {
        await apiSetMentorPairings(config.id, pairingEntries);
      }

      const result = await apiActivateCohortEvaluation(config.id);
      const skippedTotal =
        result.skipped.alreadyAssigned + result.skipped.noMentor + result.skipped.noPublishedTeam + result.skipped.outOfScope;
      showSuccess(
        `Evaluation activated — assigned to ${result.newlyAssignedCount} student(s)` +
          (result.repairedCount > 0 ? `, repaired ${result.repairedCount}` : '') +
          (skippedTotal > 0 ? `, skipped ${skippedTotal} (not in scope, already assigned, or not ready)` : '') +
          '.',
      );
      onCreated();
      onClose();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to set up evaluation');
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
                Tracks <span className="normal-case text-gray-600">(blank = every track)</span>
              </label>
              <Select
                isMulti
                value={selectedTrackIds}
                onChange={setSelectedTrackIds}
                placeholder="All tracks"
                options={trackOptions.map((t) => ({ value: t.id, label: t.name }))}
                menuMinWidth={340}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                Batches <span className="normal-case text-gray-600">(blank = every batch)</span>
              </label>
              <Select
                isMulti
                value={selectedBatches}
                onChange={setSelectedBatches}
                placeholder="All batches"
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

          {/* Step 2: who's judging — panel size and pairings. Comes before
              Rubric on purpose: whether marking a criterion Panel actually
              means anything depends on whether a real external panel exists
              for this scope, which this step is what answers. */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest whitespace-nowrap">
                  External panelists
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setExternalEvaluatorCount((c) => {
                        const next = Math.max(0, c - 1);
                        // Drop any pairing sitting in a column this just removed,
                        // so no row keeps an "External N" pick with no column
                        // left to show it in.
                        setPairings((prev) => {
                          const trimmed: Record<string, string[]> = {};
                          for (const [mentorId, externals] of Object.entries(prev)) trimmed[mentorId] = externals.slice(0, next);
                          return trimmed;
                        });
                        return next;
                      })
                    }
                    disabled={externalEvaluatorCount === 0}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 text-gray-300 hover:text-white hover:border-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-8 text-center text-sm font-semibold text-white tabular-nums">{externalEvaluatorCount}</span>
                  <button
                    type="button"
                    onClick={() => setExternalEvaluatorCount((c) => c + 1)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 text-gray-300 hover:text-white hover:border-zinc-600 transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <span className="text-[11px] text-gray-500">
                  per student, on top of their one fixed internal mentor — each + adds an "External N" column below
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                  Mentor Pairings{' '}
                  <span className="normal-case text-gray-600">(internal mentor is automatic, optional)</span>
                </label>
                {selectedTrackIds.length > 0 && pairingRowMentors.length === 0 && (
                  <p className="text-[11px] text-amber-400/80 mb-1.5">
                    No mentor in this cohort has a student allocated in the selected track(s) yet, so there's nobody
                    to pair an external partner with — every in-scope student will get their internal mentor alone
                    unless this is created without any pairings and recreated once allocation happens.
                  </p>
                )}
                {externalEvaluatorCount === 0 && (
                  <p className="text-[11px] text-gray-500 mb-1.5">
                    External panelists is 0 — every in-scope student will be scored by their internal mentor alone.
                    Click + above to add a column and start pairing.
                  </p>
                )}
                <div className="max-h-72 overflow-auto rounded-lg border border-zinc-800">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-zinc-850 z-10">
                      <tr>
                        <th className="px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-widest border-b border-zinc-800 w-56">
                          Internal Mentor
                        </th>
                        {Array.from({ length: externalEvaluatorCount }).map((_, i) => (
                          <th
                            key={i}
                            className="px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-widest border-b border-l border-zinc-800 min-w-[160px]"
                          >
                            External {i + 1}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pairingRowMentors.map((mentor) => {
                        const badge = loadBadge(mentor.id);
                        const externals = pairings[mentor.id] || [];
                        const workload = workloadByMentorId.get(mentor.id);
                        const workloadTrackNames = (workload?.trackIds ?? []).map((id) => trackNameById.get(id) ?? id);
                        return (
                          <tr key={mentor.id} className="border-b border-zinc-800 last:border-0">
                            <td className="px-3 py-2 align-top">
                              <span className="text-xs text-gray-300 block truncate" title={mentor.fullName || mentor.email}>
                                {mentor.fullName || mentor.email}
                              </span>
                              {workload ? (
                                <>
                                  <span className="flex flex-wrap gap-1 mt-1">
                                    {workloadTrackNames.map((name) => (
                                      <span
                                        key={name}
                                        className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-gold/10 text-gold border border-gold/30 truncate max-w-[180px]"
                                      >
                                        {name}
                                      </span>
                                    ))}
                                  </span>
                                  <span className="block text-[10px] text-gray-500 mt-1">
                                    {workload.teamCount} team{workload.teamCount === 1 ? '' : 's'} ·{' '}
                                    {workload.studentCount} student{workload.studentCount === 1 ? '' : 's'}
                                  </span>
                                </>
                              ) : (
                                <span className="block text-[10px] text-gray-600 mt-1">No students allocated yet</span>
                              )}
                              {badge && <span className="block text-[10px] text-gray-500 mt-1">{badge}</span>}
                            </td>
                            {Array.from({ length: externalEvaluatorCount }).map((_, colIndex) => {
                              const filledId = externals[colIndex];
                              const filled = filledId ? cohortMentors.find((m) => m.id === filledId) : undefined;
                              return (
                                <td key={colIndex} className="px-2 py-1.5 align-top border-l border-zinc-800">
                                  {filled ? (
                                    <div className="flex items-center justify-between gap-1.5 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5">
                                      <span className="text-xs text-white truncate">{filled.fullName || filled.email}</span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPairings((prev) => {
                                            const next = [...(prev[mentor.id] || [])];
                                            next[colIndex] = '';
                                            return { ...prev, [mentor.id]: next };
                                          })
                                        }
                                        className="shrink-0 text-gray-500 hover:text-red-400"
                                      >
                                        <X size={12} />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setPickerTarget({ internalMentorId: mentor.id, columnIndex: colIndex })}
                                      className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-dashed border-zinc-700 text-gray-500 hover:text-gold hover:border-gold/40 text-xs transition-colors"
                                    >
                                      <Plus size={12} /> Add
                                    </button>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <MentorPickerPanel
            open={!!pickerTarget}
            onClose={() => setPickerTarget(null)}
            mentors={pickerTarget ? cohortMentors.filter((m) => m.id !== pickerTarget.internalMentorId) : []}
            trackNameBySlug={trackNameBySlug}
            internalMentorName={pickerInternalMentorName}
            internalMentorTrackNames={pickerInternalMentorTrackNames}
            internalMentorTeamCount={pickerInternalMentorWorkload?.teamCount}
            internalMentorStudentCount={pickerInternalMentorWorkload?.studentCount}
            onSelect={(mentorId) => {
              if (!pickerTarget) return;
              setPairings((prev) => {
                const next = [...(prev[pickerTarget.internalMentorId] || [])];
                next[pickerTarget.columnIndex] = mentorId;
                return { ...prev, [pickerTarget.internalMentorId]: next };
              });
            }}
          />

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
                      <input
                        type="text"
                        value={newRubricName}
                        onChange={(e) => setNewRubricName(e.target.value)}
                        placeholder="Rubric name, e.g. Viva Rubric v1"
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gold/40"
                      />
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
                              onClick={() => toggleCriterionScorer(i)}
                              title="Who scores this — every panelist, or only the student's own mentor (for an artifact like a PRD or logbook nobody else saw)"
                              className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-1.5 rounded-lg border transition-colors ${
                                c.scoredBy === 'internal'
                                  ? 'bg-gold/10 border-gold/40 text-gold'
                                  : 'bg-zinc-800 border-zinc-700 text-gray-400 hover:text-gray-300'
                              }`}
                            >
                              {c.scoredBy === 'internal' ? 'Internal only' : 'Panel'}
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
                        <button onClick={addDocumentCriterionRow} className="text-xs text-gold hover:text-gold-hover flex items-center gap-1">
                          <Plus size={12} /> Include Document marks
                        </button>
                        <button onClick={addAttendanceCriterionRow} className="text-xs text-gold hover:text-gold-hover flex items-center gap-1">
                          <Plus size={12} /> Include Attendance
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        Total: {criteriaDrafts.reduce((s, c) => s + (Number(c.maxMarks) || 0), 0)} marks · "Include Document
                        marks" and "Include Attendance" add an internal-only criterion ready-toggled — nobody but this
                        student's own mentor ever saw either one
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
