import { useState, useEffect, useCallback } from 'react';
import { ClipboardCheck, Plus, X } from 'lucide-react';
import Select from '../../../components/Select';
import SpinnerSquare from '../../../components/SpinnerSquare';
import type { ApiMentor, EvaluationTypeTemplate, RubricTemplate, EvaluationMode } from '../../../lib/types';
import {
  apiListEvaluationTypes,
  apiCreateEvaluationType,
  apiListRubricTemplates,
  apiCreateRubricTemplate,
  apiCreateCohortEvaluationConfig,
  apiSetMentorPairings,
  apiActivateCohortEvaluation,
} from '../../../lib/api/evaluations';
import { useToast } from '../../../toast';

const MODE_OPTIONS: { value: EvaluationMode; label: string }[] = [
  { value: 'upload', label: 'Upload (internal mentor only — e.g. Logbook, PRD, Attendance)' },
  { value: 'rubric', label: 'Rubric (internal + external panel — e.g. Viva, Final Presentation)' },
];

interface CriterionDraft {
  name: string;
  maxMarks: string;
}

// Wizard-in-a-modal for setting up a new evaluation on this cohort. Kept as a
// single scrollable form with sections that reveal themselves as choices are
// made, rather than a multi-step Next/Back flow — the fields involved don't
// need that much ceremony.
export function AddEvaluationModal({
  cohortId,
  cohortMentors,
  onClose,
  onCreated,
}: {
  cohortId: string;
  cohortMentors: ApiMentor[];
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
  const [criteriaDrafts, setCriteriaDrafts] = useState<CriterionDraft[]>([{ name: '', maxMarks: '' }]);
  const [uploadMaxMarks, setUploadMaxMarks] = useState('');

  const [sequenceNo, setSequenceNo] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [pairings, setPairings] = useState<Record<string, string>>({});

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
    const type = types.find((t) => t.id === id);
    if (type?.mode === 'rubric') loadRubrics(id);
  };

  const addCriterionRow = () => setCriteriaDrafts((prev) => [...prev, { name: '', maxMarks: '' }]);
  const removeCriterionRow = (index: number) =>
    setCriteriaDrafts((prev) => prev.filter((_, i) => i !== index));
  const updateCriterionRow = (index: number, field: keyof CriterionDraft, value: string) =>
    setCriteriaDrafts((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));

  const mentorOptions = (excludeId: string) =>
    cohortMentors
      .filter((m) => m.id !== excludeId)
      .map((m) => ({ value: m.id, label: m.fullName || m.email || m.id }));

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
            : criteriaDrafts.map((c) => ({ name: c.name.trim(), maxMarks: Number(c.maxMarks) }));
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
      });

      if (mode === 'rubric') {
        const pairingEntries = Object.entries(pairings)
          .filter(([, externalId]) => !!externalId)
          .map(([internalMentorId, externalMentorId]) => ({ internalMentorId, externalMentorId }));
        if (pairingEntries.length > 0) {
          await apiSetMentorPairings(config.id, pairingEntries);
        }
      }

      const { newlyAssignedCount } = await apiActivateCohortEvaluation(config.id);
      showSuccess(`Evaluation activated — assigned to ${newlyAssignedCount} student(s).`);
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
                        Total: {criteriaDrafts.reduce((s, c) => s + (Number(c.maxMarks) || 0), 0)} marks
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

          {/* Mentor pairings — only for rubric-mode types */}
          {selectedType?.mode === 'rubric' && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                Mentor Pairings <span className="normal-case text-gray-600">(internal mentor is automatic — pick their external partner, optional)</span>
              </label>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {cohortMentors.map((mentor) => (
                  <div key={mentor.id} className="flex items-center gap-2">
                    <span className="text-xs text-gray-300 w-36 truncate shrink-0">{mentor.fullName || mentor.email}</span>
                    <Select
                      variant="filter"
                      className="flex-1"
                      value={pairings[mentor.id] || ''}
                      onChange={(v) => setPairings((prev) => ({ ...prev, [mentor.id]: v }))}
                      placeholder="No external mentor"
                      options={mentorOptions(mentor.id)}
                    />
                  </div>
                ))}
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

