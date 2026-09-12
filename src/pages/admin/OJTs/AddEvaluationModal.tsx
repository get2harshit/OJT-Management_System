import { useState, useEffect, useCallback } from 'react';
import { ClipboardCheck, Plus, Minus, X, Gauge, Search } from 'lucide-react';
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

  // How many secondaries this evaluation is declared to have, on top of the
  // one fixed primary — starts at 0 (no panel declared yet) and is a
  // stepper, not free text, since it doubles as the column count for the
  // pairings grid below: every +/- click adds or drops a "Secondary N"
  // column for every row at once.
  const [secondaryEvaluatorCount, setSecondaryEvaluatorCount] = useState(0);
  // One primary mentor -> up to secondaryEvaluatorCount secondaries, indexed
  // by column position (pairings[mentorId][0] is that row's "Secondary 1",
  // etc.) — not just an unordered set, since each column is its own slot.
  const [pairings, setPairings] = useState<Record<string, string[]>>({});
  // Which grid cell's picker drawer is currently open, if any.
  const [pickerTarget, setPickerTarget] = useState<{ primaryMentorId: string; columnIndex: number } | null>(null);
  // Panel load summary — totals plus a per-mentor breakdown, shown on demand
  // behind the gauge icon rather than always on screen, same as Allocations'
  // own Mentor Load Summary.
  const [showPanelMeter, setShowPanelMeter] = useState(false);
  const [panelMeterSearch, setPanelMeterSearch] = useState('');

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
  const projectedSecondaryCounts = (() => {
    const counts = new Map<string, number>();
    for (const secondaryIds of Object.values(pairings)) {
      for (const id of secondaryIds) counts.set(id, (counts.get(id) ?? 0) + 1);
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
  const pickerPrimaryMentor = pickerTarget
    ? cohortMentors.find((m) => m.id === pickerTarget.primaryMentorId)
    : undefined;
  const pickerPrimaryMentorName = pickerPrimaryMentor?.fullName || pickerPrimaryMentor?.email || '';
  const pickerPrimaryMentorWorkload = pickerTarget ? workloadByMentorId.get(pickerTarget.primaryMentorId) : undefined;
  const pickerPrimaryMentorTrackNames = (pickerPrimaryMentorWorkload?.trackIds ?? []).map(
    (id) => trackNameById.get(id) ?? id,
  );

  // Existing panel-load badge — secondary commitments only (how loaded this
  // mentor already is as a SECONDARY panelist elsewhere). Their own-student
  // count lives in the workload line above it instead, so it isn't repeated
  // here.
  const loadBadge = (mentorId: string) => {
    const existing = panelLoad.find((l) => l.mentorId === mentorId);
    const existingSecondary = existing?.secondaryStudentCount ?? 0;
    const projected = projectedSecondaryCounts.get(mentorId) ?? 0;
    if (existingSecondary === 0 && projected === 0) return null;
    return `${existingSecondary}${projected > 0 ? `+${projected}` : ''} sec`;
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
  // reviewed document (PRD, OJL logbook, ...) or attendance. Attendance
  // stays Primary Only: only the student's own mentor actually takes it, so
  // nobody else has a basis to mark it. A document is different — any
  // panelist can be handed read access to review it (see
  // StudentSubmissionsPanel / the backend's isEvaluationPanelistForStudent
  // grant), so it's Panel like Viva Performance, best-of across whoever
  // scores it. Document keeps the name blank (which document varies);
  // Attendance never does, since it's always exactly that.
  const addDocumentCriterionRow = () =>
    setCriteriaDrafts((prev) => [...prev, { name: '', maxMarks: '', scoredBy: 'panel' }]);
  const addAttendanceCriterionRow = () =>
    setCriteriaDrafts((prev) => [...prev, { name: 'Attendance', maxMarks: '', scoredBy: 'primary' }]);
  const removeCriterionRow = (index: number) =>
    setCriteriaDrafts((prev) => prev.filter((_, i) => i !== index));
  const updateCriterionRow = (index: number, field: 'name' | 'maxMarks', value: string) =>
    setCriteriaDrafts((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  const toggleCriterionScorer = (index: number) =>
    setCriteriaDrafts((prev) =>
      prev.map((c, i) => (i === index ? { ...c, scoredBy: c.scoredBy === 'panel' ? 'primary' : 'panel' } : c)),
    );

  // Which mentors get a pairing row: everyone when the scope is every track
  // AND every batch (both blank), otherwise only mentors who actually have
  // an allocated student matching BOTH the selected track(s) AND the
  // selected batch(es) right now — a primary mentor whose only student
  // falls outside either filter is never going to be this config's
  // automatic primary for anyone, so listing them here is just noise to
  // scroll past, or worse: a pairing that looks set up but activation (which
  // checks track AND batch) will never actually create anything for. The
  // MentorPickerPanel's own candidate list stays unfiltered — a secondary
  // panelist is deliberately allowed to come from outside either.
  const pairingRowMentors = cohortMentors.filter((m) => {
    if (selectedTrackIds.length > 0 && !selectedTrackIds.some((trackId) => trackMentorIndex.get(trackId)?.has(m.id))) {
      return false;
    }
    if (selectedBatches.length > 0) {
      const mentorBatches = workloadByMentorId.get(m.id)?.batches ?? [];
      if (!selectedBatches.some((batch) => mentorBatches.includes(batch))) return false;
    }
    return true;
  });

  // Top-of-step summary meter for Mentor + Panel — the same "stat tile row"
  // pattern as the Allocations page's own Mentor Load Summary, rebuilt from
  // data this step already has (workload + the form's own draft pairings)
  // rather than a new endpoint.
  const panelMeter = (() => {
    let teamCount = 0;
    let studentCount = 0;
    let filledSlots = 0;
    const secondaryMentorIds = new Set<string>();
    for (const mentor of pairingRowMentors) {
      const w = workloadByMentorId.get(mentor.id);
      teamCount += w?.teamCount ?? 0;
      studentCount += w?.studentCount ?? 0;
      for (const id of pairings[mentor.id] || []) {
        if (!id) continue;
        filledSlots += 1;
        secondaryMentorIds.add(id);
      }
    }
    const totalSlots = pairingRowMentors.length * secondaryEvaluatorCount;
    return {
      mentorCount: pairingRowMentors.length,
      teamCount,
      studentCount,
      secondaryMentorCount: secondaryMentorIds.size,
      filledSlots,
      totalSlots,
      pendingSlots: Math.max(0, totalSlots - filledSlots),
    };
  })();

  const closePanelMeter = () => {
    setShowPanelMeter(false);
    setPanelMeterSearch('');
  };

  // How much viva load each mentor is picking up as a SECONDARY, in this
  // draft — every place a primary mentor's row names them, they take on
  // that primary's own team/student count too (same students, second
  // opinion). Distinct from the row's own "Secondary: ..." line, which
  // shows who THIS mentor picked, not who picked THEM.
  const secondaryLoadByMentorId = (() => {
    const map = new Map<string, { slots: number; teamCount: number; studentCount: number }>();
    for (const mentor of pairingRowMentors) {
      const w = workloadByMentorId.get(mentor.id);
      for (const secondaryId of pairings[mentor.id] || []) {
        if (!secondaryId) continue;
        const entry = map.get(secondaryId) ?? { slots: 0, teamCount: 0, studentCount: 0 };
        entry.slots += 1;
        entry.teamCount += w?.teamCount ?? 0;
        entry.studentCount += w?.studentCount ?? 0;
        map.set(secondaryId, entry);
      }
    }
    return map;
  })();

  // The list's own roster, wider than the top tiles' "Mentors" count on
  // purpose: a mentor picked as someone's secondary but with no primary
  // students of their own (an industry mentor, most often) never has a row
  // in pairingRowMentors, so without this they'd never appear here either —
  // their own "Secondary for ..." line would exist but nowhere to show it.
  const panelMeterRoster = (() => {
    const seen = new Set(pairingRowMentors.map((m) => m.id));
    const extra: ApiMentor[] = [];
    for (const mentor of pairingRowMentors) {
      for (const secondaryId of pairings[mentor.id] || []) {
        if (!secondaryId || seen.has(secondaryId)) continue;
        const m = cohortMentors.find((cm) => cm.id === secondaryId);
        if (m) {
          extra.push(m);
          seen.add(secondaryId);
        }
      }
    }
    return [...pairingRowMentors, ...extra];
  })();

  // Per-mentor list inside the meter, narrowed by its own search box — the
  // top tiles above stay as totals for the whole in-scope panel regardless,
  // so filtering to one name doesn't make "Mentors: 68" look like a bug.
  const panelMeterMentors = panelMeterSearch.trim()
    ? panelMeterRoster.filter((m) => {
        const q = panelMeterSearch.trim().toLowerCase();
        return (m.fullName || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q);
      })
    : panelMeterRoster;

  // Step 1 (Target): a window, plus an explicit track and batch scope — no
  // more implicit "blank = everyone", so an admin can't accidentally
  // activate an evaluation cohort-wide by leaving a field empty.
  const targetValid = !!startDate && !!endDate && selectedTrackIds.length > 0 && selectedBatches.length > 0;

  // Step 2 (Mentor + Panel): a panel size of 0 has nothing to fill in, so
  // it's fine to move on with no pairings at all. Once it's above 0 though,
  // every in-scope primary mentor's row must have EVERY secondary column
  // filled — a half-paired panel would silently leave some students with
  // no secondary evaluator once activated.
  const incompletePairingRows =
    secondaryEvaluatorCount === 0
      ? []
      : pairingRowMentors.filter((mentor) => {
          const secondaries = pairings[mentor.id] || [];
          return secondaries.length !== secondaryEvaluatorCount || secondaries.some((id) => !id);
        });
  const panelValid = incompletePairingRows.length === 0;

  // With no secondary panelists at all, Panel vs Primary-only scoring is a
  // distinction without a difference — one scorer either way, so the split
  // changes neither the final mark nor what shows up in any report. Locking
  // the per-criterion toggle in that case (Step 3) saves the admin a choice
  // that has no effect, rather than letting them pick between two options
  // that behave identically here.
  const secondaryLocked = secondaryEvaluatorCount === 0;

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
        secondaryEvaluatorCount,
      });

      const pairingEntries = Object.entries(pairings).flatMap(([primaryMentorId, secondaryIds]) =>
        secondaryIds.filter(Boolean).map((secondaryMentorId) => ({ primaryMentorId, secondaryMentorId })),
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

          {/* Step 2: who's judging — panel size and pairings. Comes before
              Rubric on purpose: whether marking a criterion Panel actually
              means anything depends on whether a real secondary panel exists
              for this scope, which this step is what answers. */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest whitespace-nowrap">
                  Secondary panelists
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setSecondaryEvaluatorCount((c) => {
                        const next = Math.max(0, c - 1);
                        // Drop any pairing sitting in a column this just removed,
                        // so no row keeps an "External N" pick with no column
                        // left to show it in.
                        setPairings((prev) => {
                          const trimmed: Record<string, string[]> = {};
                          for (const [mentorId, secondaries] of Object.entries(prev)) trimmed[mentorId] = secondaries.slice(0, next);
                          return trimmed;
                        });
                        return next;
                      })
                    }
                    disabled={secondaryEvaluatorCount === 0}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 text-gray-300 hover:text-white hover:border-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-8 text-center text-sm font-semibold text-white tabular-nums">{secondaryEvaluatorCount}</span>
                  <button
                    type="button"
                    onClick={() => setSecondaryEvaluatorCount((c) => c + 1)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 text-gray-300 hover:text-white hover:border-zinc-600 transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <span className="text-[11px] text-gray-500">
                  per student, on top of their one fixed primary mentor — each + adds a "Secondary N" column below
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                    Mentor Pairings{' '}
                    <span className="normal-case text-gray-600">
                      {secondaryEvaluatorCount === 0
                        ? '(primary mentor is automatic, optional)'
                        : '(every secondary slot below is required)'}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPanelMeter(true)}
                    title="Panel load summary"
                    className="flex items-center gap-1.5 text-[11px] px-2 py-1 bg-zinc-800 text-gray-300 font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-750 hover:text-white transition-colors"
                  >
                    <Gauge size={13} />
                  </button>
                </div>
                {pairingRowMentors.length === 0 && (
                  <p className="text-[11px] text-amber-400/80 mb-1.5">
                    No mentor in this cohort has a student allocated matching both the selected track(s) and
                    batch(es) yet, so there's nobody to pair a secondary partner with — every in-scope student will
                    get their primary mentor alone unless this is created without any pairings and recreated once
                    allocation happens.
                  </p>
                )}
                {secondaryEvaluatorCount === 0 && (
                  <p className="text-[11px] text-gray-500 mb-1.5">
                    Secondary panelists is 0 — every in-scope student will be scored by their primary mentor alone.
                    Click + above to add a column and start pairing.
                  </p>
                )}
                {incompletePairingRows.length > 0 && (
                  <p className="text-[11px] text-amber-400/80 mb-1.5">
                    {incompletePairingRows.length} mentor{incompletePairingRows.length === 1 ? '' : 's'} still{' '}
                    {incompletePairingRows.length === 1 ? 'has' : 'have'} an empty secondary slot — fill every "Add"
                    below before continuing.
                  </p>
                )}
                <div className="max-h-72 overflow-auto rounded-lg border border-zinc-800">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-zinc-850 z-10">
                      <tr>
                        <th className="px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-widest border-b border-zinc-800 w-56">
                          Primary Mentor
                        </th>
                        {Array.from({ length: secondaryEvaluatorCount }).map((_, i) => (
                          <th
                            key={i}
                            className="px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-widest border-b border-l border-zinc-800 min-w-[160px]"
                          >
                            Secondary {i + 1}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pairingRowMentors.map((mentor) => {
                        const badge = loadBadge(mentor.id);
                        const secondaries = pairings[mentor.id] || [];
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
                                  <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-500/10 text-gray-400">
                                    {workload.teamCount} team{workload.teamCount === 1 ? '' : 's'} ·{' '}
                                    {workload.studentCount} student{workload.studentCount === 1 ? '' : 's'}
                                  </span>
                                </>
                              ) : (
                                <span className="block text-[10px] text-gray-600 mt-1">No students allocated yet</span>
                              )}
                              {badge && <span className="block text-[10px] text-gray-500 mt-1">{badge}</span>}
                            </td>
                            {Array.from({ length: secondaryEvaluatorCount }).map((_, colIndex) => {
                              const filledId = secondaries[colIndex];
                              const filled = filledId ? cohortMentors.find((m) => m.id === filledId) : undefined;
                              return (
                                <td key={colIndex} className="px-2 py-1.5 align-top border-l border-zinc-800">
                                  {filled ? (
                                    <div className="h-8 flex items-center justify-between gap-1.5 bg-zinc-800 border border-zinc-700 rounded-lg px-2">
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
                                      onClick={() => setPickerTarget({ primaryMentorId: mentor.id, columnIndex: colIndex })}
                                      className="h-8 w-full flex items-center justify-center gap-1 px-2 rounded-lg border border-dashed border-zinc-700 text-gray-500 hover:text-gold hover:border-gold/40 text-xs transition-colors"
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
            mentors={pickerTarget ? cohortMentors.filter((m) => m.id !== pickerTarget.primaryMentorId) : []}
            trackNameBySlug={trackNameBySlug}
            primaryMentorName={pickerPrimaryMentorName}
            primaryMentorTrackNames={pickerPrimaryMentorTrackNames}
            primaryMentorTeamCount={pickerPrimaryMentorWorkload?.teamCount}
            primaryMentorStudentCount={pickerPrimaryMentorWorkload?.studentCount}
            selectedCounts={projectedSecondaryCounts}
            onSelect={(mentorId) => {
              if (!pickerTarget) return;
              setPairings((prev) => {
                const next = [...(prev[pickerTarget.primaryMentorId] || [])];
                next[pickerTarget.columnIndex] = mentorId;
                return { ...prev, [pickerTarget.primaryMentorId]: next };
              });
            }}
          />

          {showPanelMeter && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/70" onClick={closePanelMeter} />
              <div className="relative w-full max-w-2xl max-h-[80vh] bg-zinc-900 border border-zinc-750 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Gauge size={16} className="text-gold" /> Panel Load Summary
                  </h4>
                  <button
                    onClick={closePanelMeter}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="p-5 overflow-y-auto">
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
                    {(
                      [
                        ['Mentors', panelMeter.mentorCount, 'text-white'],
                        ['Own Teams', panelMeter.teamCount, 'text-white'],
                        ['Own Students', panelMeter.studentCount, 'text-white'],
                        ['Secondary Mentors', panelMeter.secondaryMentorCount, 'text-gold'],
                        [
                          'Slots Filled',
                          `${panelMeter.filledSlots}/${panelMeter.totalSlots}`,
                          panelMeter.pendingSlots > 0 ? 'text-amber-400' : 'text-green-500',
                        ],
                        [
                          'Pending Slots',
                          panelMeter.pendingSlots,
                          panelMeter.pendingSlots > 0 ? 'text-amber-400' : 'text-gray-500',
                        ],
                      ] as const
                    ).map(([label, value, tone]) => (
                      <div key={label} className="rounded-lg bg-zinc-800/60 border border-zinc-750 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">{label}</p>
                        <p className={`text-lg font-bold tabular-nums ${tone}`}>{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Per mentor</p>
                  </div>
                  <div className="relative mb-2">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type="text"
                      value={panelMeterSearch}
                      onChange={(e) => setPanelMeterSearch(e.target.value)}
                      placeholder="Search mentors by name or email..."
                      className="w-full pl-7 pr-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gold/40"
                    />
                  </div>
                  <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800">
                    {panelMeterMentors.length === 0 ? (
                      <p className="text-xs text-gray-500 text-center py-6">
                        {panelMeterSearch ? 'No mentor matches.' : 'No mentor in scope.'}
                      </p>
                    ) : (
                      panelMeterMentors.map((mentor) => {
                        const workload = workloadByMentorId.get(mentor.id);
                        const trackNames = (workload?.trackIds ?? []).map((id) => trackNameById.get(id) ?? id);
                        const secondaries = (pairings[mentor.id] || [])
                          .filter((id) => !!id)
                          .map((id) => cohortMentors.find((m) => m.id === id)?.fullName || 'Unknown');
                        const secondaryLoad = secondaryLoadByMentorId.get(mentor.id);
                        return (
                          <div key={mentor.id} className="px-3 py-2 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs text-gray-200 truncate">{mentor.fullName || mentor.email}</p>
                              <p className="text-[10px] text-gray-500 truncate">
                                {trackNames.join(', ') || 'No track'} · {workload?.teamCount ?? 0} team
                                {(workload?.teamCount ?? 0) === 1 ? '' : 's'} · {workload?.studentCount ?? 0} student
                                {(workload?.studentCount ?? 0) === 1 ? '' : 's'}
                              </p>
                              {secondaries.length > 0 && (
                                <p className="text-[10px] text-gray-500 truncate">
                                  Secondary: {secondaries.join(', ')}
                                </p>
                              )}
                              {secondaryLoad && (
                                <p className="text-[10px] text-gold truncate">
                                  Secondary for {secondaryLoad.slots} place{secondaryLoad.slots === 1 ? '' : 's'} ·{' '}
                                  {secondaryLoad.teamCount} team{secondaryLoad.teamCount === 1 ? '' : 's'} ·{' '}
                                  {secondaryLoad.studentCount} student{secondaryLoad.studentCount === 1 ? '' : 's'}
                                </p>
                              )}
                            </div>
                            {secondaryEvaluatorCount > 0 && (
                              <span
                                className={`shrink-0 text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded ${
                                  secondaries.length === secondaryEvaluatorCount
                                    ? 'text-green-500 bg-green-500/10'
                                    : 'text-amber-400 bg-amber-400/10'
                                }`}
                              >
                                {secondaries.length}/{secondaryEvaluatorCount}
                              </span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
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
                        <button onClick={addDocumentCriterionRow} className="text-xs text-gold hover:text-gold-hover flex items-center gap-1">
                          <Plus size={12} /> Include Document marks
                        </button>
                        <button onClick={addAttendanceCriterionRow} className="text-xs text-gold hover:text-gold-hover flex items-center gap-1">
                          <Plus size={12} /> Include Attendance
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        Total: {criteriaDrafts.reduce((s, c) => s + (Number(c.maxMarks) || 0), 0)} marks · "Include
                        Attendance" adds a primary-only criterion — only this student's own mentor actually takes
                        attendance. "Include Document marks" adds a Panel one instead — any panelist can review the
                        student's submission and score it.
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
