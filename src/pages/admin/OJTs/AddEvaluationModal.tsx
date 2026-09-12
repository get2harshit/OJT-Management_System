import { useState, useEffect, useCallback } from 'react';
import { ClipboardCheck, Plus, X } from 'lucide-react';
import Select from '../../../components/Select';
import SpinnerSquare from '../../../components/SpinnerSquare';
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
  type MentorPanelLoad,
} from '../../../lib/api/evaluations';
import { apiGetCohortTrackConfig } from '../../../lib/api/tracks';
import { getTrackColor } from '../../../lib/constants';
import { useToast } from '../../../toast';

const MODE_OPTIONS: { value: EvaluationMode; label: string }[] = [
  { value: 'upload', label: 'Upload (internal mentor only — e.g. Logbook, PRD, Attendance)' },
  { value: 'rubric', label: 'Rubric (internal + external panel — e.g. Viva, Final Presentation)' },
];

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

// Wizard-in-a-modal for setting up a new evaluation on this cohort. Kept as a
// single scrollable form with sections that reveal themselves as choices are
// made, rather than a multi-step Next/Back flow — the fields involved don't
// need that much ceremony.
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
  const [newTypeMode, setNewTypeMode] = useState<EvaluationMode>('rubric');

  const [rubrics, setRubrics] = useState<RubricTemplate[]>([]);
  const [loadingRubrics, setLoadingRubrics] = useState(false);
  const [selectedRubricId, setSelectedRubricId] = useState('');
  const [creatingNewRubric, setCreatingNewRubric] = useState(false);
  const [newRubricName, setNewRubricName] = useState('');
  const [criteriaDrafts, setCriteriaDrafts] = useState<CriterionDraft[]>([{ name: '', maxMarks: '', scoredBy: 'panel' }]);
  const [uploadMaxMarks, setUploadMaxMarks] = useState('');

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
  // one fixed internal. Pairings below are what's actually created —
  // this is what a mismatch gets checked against later.
  const [externalEvaluatorCount, setExternalEvaluatorCount] = useState('1');
  // One internal mentor -> up to externalEvaluatorCount externals now,
  // not just one.
  const [pairings, setPairings] = useState<Record<string, string[]>>({});

  // Existing committed load only — this config's own picks below aren't
  // counted here since they don't exist as real panelist rows yet, which
  // is exactly why the projection below adds them back in on top.
  const [panelLoad, setPanelLoad] = useState<MentorPanelLoad[]>([]);

  const [submitting, setSubmitting] = useState(false);

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

  const loadBadge = (mentorId: string) => {
    const existing = panelLoad.find((l) => l.mentorId === mentorId);
    const existingExternal = existing?.externalStudentCount ?? 0;
    const existingInternal = existing?.internalStudentCount ?? 0;
    const projected = projectedExternalCounts.get(mentorId) ?? 0;
    if (existingExternal === 0 && existingInternal === 0 && projected === 0) return null;
    const parts: string[] = [];
    if (existingInternal > 0) parts.push(`${existingInternal} own`);
    if (existingExternal + projected > 0) {
      parts.push(`${existingExternal}${projected > 0 ? `+${projected}` : ''} ext`);
    }
    return parts.join(' · ');
  };

  const selectedType = creatingNewType
    ? { id: '', name: newTypeName, mode: newTypeMode }
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
      prev.map((c, i) => (i === index ? { ...c, scoredBy: c.scoredBy === 'panel' ? 'internal' : 'panel' } : c)),
    );

  const trackNameBySlug = new Map(trackOptions.map((t) => [t.slug, t.name]));

  // An external panelist is deliberately allowed to come from any track, not
  // just the one(s) scoped above — so the admin needs the track(s) each
  // candidate actually serves right in the picker to judge whether they're a
  // sensible fit, not just a bare name.
  const mentorOptions = (excludeId: string) =>
    cohortMentors
      .filter((m) => m.id !== excludeId)
      .map((m) => {
        const trackNames = (m.tracks ?? []).map((slug) => trackNameBySlug.get(slug) ?? slug);
        return {
          value: m.id,
          label: m.fullName || m.email || m.id,
          sublabel: trackNames.length > 0 ? trackNames.join(', ') : 'No track assigned',
          sublabelDotClass: getTrackColor(m.tracks?.[0]).dot,
        };
      });

  // Which mentors get a pairing row: everyone when the scope is every track
  // (blank), otherwise only mentors who actually have an allocated student
  // in at least one selected track right now — an internal mentor with no
  // student in scope is never going to be this config's automatic internal
  // for anyone, so listing them here is just noise to scroll past. The
  // external-mentor OPTIONS inside each row stay unfiltered (mentorOptions
  // above) — an external panelist is deliberately allowed to come from
  // outside the track.
  const pairingRowMentors =
    selectedTrackIds.length === 0
      ? cohortMentors
      : cohortMentors.filter((m) => selectedTrackIds.some((trackId) => trackMentorIndex.get(trackId)?.has(m.id)));

  const canSubmit =
    (creatingNewType ? newTypeName.trim().length > 0 : !!selectedTypeId) &&
    startDate &&
    endDate &&
    (selectedType?.mode === 'upload'
      ? creatingNewRubric
        ? Number(uploadMaxMarks) > 0
        : !!selectedRubricId
      : creatingNewRubric
        ? newRubricName.trim().length > 0 && criteriaDrafts.every((c) => c.name.trim() && Number(c.maxMarks) > 0)
        : !!selectedRubricId);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      let typeId = selectedTypeId;
      let mode: EvaluationMode = selectedType?.mode || 'rubric';
      if (creatingNewType) {
        const created = await apiCreateEvaluationType(newTypeName.trim(), newTypeMode);
        typeId = created.id;
        mode = created.mode;
      }

      let rubricId = selectedRubricId;
      if (creatingNewRubric) {
        const criteria =
          mode === 'upload'
            ? [{ name: (creatingNewType ? newTypeName : selectedType?.name || 'Score').trim(), maxMarks: Number(uploadMaxMarks) }]
            : criteriaDrafts.map((c) => ({ name: c.name.trim(), maxMarks: Number(c.maxMarks), scoredBy: c.scoredBy }));
        const rubricName = mode === 'upload' ? `${criteria[0].name} (${criteria[0].maxMarks} marks)` : newRubricName.trim();
        const created = await apiCreateRubricTemplate(typeId, rubricName, criteria);
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
      });

      if (mode === 'rubric') {
        const pairingEntries = Object.entries(pairings).flatMap(([internalMentorId, externalIds]) =>
          externalIds.filter(Boolean).map((externalMentorId) => ({ internalMentorId, externalMentorId })),
        );
        if (pairingEntries.length > 0) {
          await apiSetMentorPairings(config.id, pairingEntries);
        }
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[85vh] overflow-y-auto bg-zinc-900 border border-zinc-750 rounded-2xl shadow-2xl p-6 mx-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-5 border-b border-zinc-800 pb-3">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <ClipboardCheck size={20} className="text-gold" />
            Add Evaluation
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5">
          {/* Evaluation type */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Evaluation Type</label>
            {loadingTypes ? (
              <SpinnerSquare size={20} />
            ) : (
              <Select
                value={creatingNewType ? '__new__' : selectedTypeId}
                onChange={handleSelectType}
                placeholder="Select an evaluation type..."
                options={[...types.map((t) => ({ value: t.id, label: `${t.name} (${t.mode})` })), { value: '__new__', label: '+ Create new type' }]}
              />
            )}
            {creatingNewType && (
              <div className="mt-3 space-y-3 p-3 bg-zinc-850 border border-zinc-800 rounded-lg">
                <input
                  type="text"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  placeholder="e.g. Mid-term Review"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gold/40"
                />
                <Select value={newTypeMode} onChange={(v) => setNewTypeMode(v as EvaluationMode)} options={MODE_OPTIONS} />
              </div>
            )}
          </div>

          {/* Audience: which tracks, which batches. Empty = everyone, same
              as every evaluation meant before scoping existed. */}
          {selectedType && (
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
          )}

          {/* Rubric (or upload max-marks) */}
          {selectedType && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                {selectedType.mode === 'upload' ? 'Max Marks' : 'Rubric'}
              </label>

              {!creatingNewType && loadingRubrics ? (
                <SpinnerSquare size={20} />
              ) : selectedType.mode === 'upload' ? (
                creatingNewRubric && rubrics.length === 0 ? (
                  <input
                    type="number"
                    min={1}
                    value={uploadMaxMarks}
                    onChange={(e) => setUploadMaxMarks(e.target.value)}
                    placeholder="e.g. 20"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gold/40"
                  />
                ) : (
                  <Select
                    value={creatingNewRubric ? '__new__' : selectedRubricId}
                    onChange={(v) => {
                      if (v === '__new__') { setCreatingNewRubric(true); setSelectedRubricId(''); }
                      else { setCreatingNewRubric(false); setSelectedRubricId(v); }
                    }}
                    placeholder="Select an existing rubric..."
                    options={[
                      ...rubrics.map((r) => ({ value: r.id, label: `${r.name} — ${r.criteria.reduce((s, c) => s + c.maxMarks, 0)} marks` })),
                      { value: '__new__', label: '+ Create new' },
                    ]}
                  />
                )
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
                      <button onClick={addCriterionRow} className="text-xs text-gold hover:text-gold-hover flex items-center gap-1">
                        <Plus size={12} /> Add criterion
                      </button>
                      <p className="text-[11px] text-gray-500">
                        Total: {criteriaDrafts.reduce((s, c) => s + (Number(c.maxMarks) || 0), 0)} marks · click "Panel"/"Internal
                        only" to mark an artifact criterion (PRD, logbook, attendance) only the internal mentor scores
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Sequence + dates */}
          {selectedType && (
            <div className="grid grid-cols-3 gap-3">
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
          )}

          {/* Panel size + mentor pairings — only for rubric-mode types */}
          {selectedType?.mode === 'rubric' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest whitespace-nowrap">
                  External panelists
                </label>
                <input
                  type="number"
                  min={0}
                  value={externalEvaluatorCount}
                  onChange={(e) => setExternalEvaluatorCount(e.target.value)}
                  className="w-20 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
                />
                <span className="text-[11px] text-gray-500">per student, on top of their one fixed internal mentor</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                  Mentor Pairings{' '}
                  <span className="normal-case text-gray-600">
                    (internal mentor is automatic — pick up to {externalEvaluatorCount || '0'} external partner
                    {externalEvaluatorCount === '1' ? '' : 's'} each, optional)
                  </span>
                </label>
                {selectedTrackIds.length > 0 && pairingRowMentors.length === 0 && (
                  <p className="text-[11px] text-amber-400/80 mb-1.5">
                    No mentor in this cohort has a student allocated in the selected track(s) yet, so there's nobody
                    to pair an external partner with — every in-scope student will get their internal mentor alone
                    unless this is created without any pairings and recreated once allocation happens.
                  </p>
                )}
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {pairingRowMentors.map((mentor) => {
                    const badge = loadBadge(mentor.id);
                    return (
                      <div key={mentor.id} className="flex items-center gap-2">
                        <span className="text-xs text-gray-300 w-36 truncate shrink-0" title={mentor.fullName || mentor.email}>
                          {mentor.fullName || mentor.email}
                          {badge && <span className="block text-[10px] text-gray-500 normal-case">{badge}</span>}
                        </span>
                        <Select
                          isMulti
                          className="flex-1"
                          value={pairings[mentor.id] || []}
                          onChange={(v) => setPairings((prev) => ({ ...prev, [mentor.id]: v }))}
                          placeholder="No external mentor"
                          options={mentorOptions(mentor.id)}
                          menuMinWidth={280}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 mt-6 pt-3 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white bg-zinc-800 hover:bg-zinc-750 rounded-lg border border-zinc-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="px-5 py-2 text-sm font-semibold text-black bg-gold hover:bg-gold-hover rounded-lg shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed"
          >
            {submitting ? 'Activating...' : 'Create & Activate'}
          </button>
        </div>
      </div>
    </div>
  );
}
