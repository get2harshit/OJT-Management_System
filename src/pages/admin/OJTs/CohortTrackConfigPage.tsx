import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Settings2, Plus, Trash2, Users, X, ListPlus } from 'lucide-react';
import CohortPageHeader from './CohortPageHeader';
import SpinnerSquare from '../../../components/SpinnerSquare';
import Select from '../../../components/Select';
import Modal from '../../../components/Modal';
import ManageTracksModal from './ManageTracksModal';
import type { ApiCohortTrackConfig, TrackEligibilityType, ApiEligibleStudent } from '../../../lib/api/tracks';
import {
  apiGetCohort,
  apiGetCohortTrackConfig,
  apiSetCohortTrackConfig,
  apiRemoveCohortTrackConfig,
  apiAddEligibleStudents,
  apiRemoveEligibleStudent,
  apiListStudentsPage,
} from '../../../lib/api';
import type { ApiStudent } from '../../../lib/types';
import { useTracks } from '../../../hooks/useTracks';
import { getCohortLabel } from '../../../lib/cohortLabel';
import { useToast } from '../../../toast';
import { useConfirm } from '../../../confirm';
import { usePageRefresh } from '../../../context/RefreshContext';

const ELIGIBILITY_OPTIONS: { value: TrackEligibilityType; label: string }[] = [
  { value: 'year', label: 'Admission year(s) (e.g. 2025, or 2024 & 2025)' },
  { value: 'batch', label: 'Batch section(s) (e.g. 2025 A, or 2025 A & 2025 B)' },
  { value: 'unique', label: 'Specific students only' },
];

const SEARCH_DEBOUNCE_MS = 400;

export default function CohortTrackConfigPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const { showSuccess, showError } = useToast();
  const confirm = useConfirm();
  const { tracks: allTracks, refetch: refetchTracks } = useTracks();

  const [cohortLabel, setCohortLabel] = useState('');
  const [allowedBatches, setAllowedBatches] = useState<string[]>([]);
  const [configs, setConfigs] = useState<ApiCohortTrackConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [manageTracksOpen, setManageTracksOpen] = useState(false);

  // Add/edit-track-config modal
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [editingTrackSlug, setEditingTrackSlug] = useState<string | null>(null);
  const [formTrackSlug, setFormTrackSlug] = useState('');
  const [formEligibilityType, setFormEligibilityType] = useState<TrackEligibilityType>('year');
  // Comma-separated years, e.g. "2024,2025" — a track can be opened to more
  // than one admission year at once.
  const [formYear, setFormYear] = useState('');
  // Multiple batch sections can be picked at once (multi-select).
  const [formBatches, setFormBatches] = useState<string[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);

  // Manage-students modal (only for 'unique' tracks)
  const [studentsModalTrackSlug, setStudentsModalTrackSlug] = useState<string | null>(null);
  const [regNumbersInput, setRegNumbersInput] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentSearchInput, setStudentSearchInput] = useState('');
  const [studentBatchFilter, setStudentBatchFilter] = useState('');
  const [searchResults, setSearchResults] = useState<ApiStudent[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [pickedStudentIds, setPickedStudentIds] = useState<Set<string>>(new Set());
  const [addingStudents, setAddingStudents] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fetchData = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    try {
      const [cohort, cfg] = await Promise.all([
        apiGetCohort(cohortId),
        apiGetCohortTrackConfig(cohortId),
      ]);
      setCohortLabel(getCohortLabel(cohort));
      setAllowedBatches(cohort.allowedBatches ?? []);
      setConfigs(cfg);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load track configuration');
    } finally {
      setLoading(false);
    }
  }, [cohortId, showError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  usePageRefresh(fetchData);

  // Tracks in the master list not yet configured for this cohort — the "add"
  // dropdown only offers these when creating a new row (editing an existing
  // one keeps its own track fixed).
  const configuredSlugs = new Set(configs.map(c => c.trackSlug));
  const unconfiguredTracks = allTracks.filter(t => !configuredSlugs.has(t.slug));

  const openAddModal = () => {
    setEditingTrackSlug(null);
    setFormTrackSlug(unconfiguredTracks[0]?.slug ?? '');
    setFormEligibilityType('year');
    setFormYear('');
    setFormBatches([]);
    setConfigModalOpen(true);
  };

  const openEditModal = (config: ApiCohortTrackConfig) => {
    setEditingTrackSlug(config.trackSlug);
    setFormTrackSlug(config.trackSlug);
    setFormEligibilityType(config.eligibilityType);
    setFormYear(config.eligibilityType === 'year' ? (config.eligibilityValue ?? '') : '');
    setFormBatches(
      config.eligibilityType === 'batch'
        ? (config.eligibilityValue ?? '').split(',').map(v => v.trim()).filter(Boolean)
        : []
    );
    setConfigModalOpen(true);
  };

  const handleSaveConfig = async () => {
    if (!cohortId || !formTrackSlug) return;
    const yearEntries = formYear.split(',').map(v => v.trim()).filter(Boolean);
    if (formEligibilityType === 'year') {
      if (yearEntries.length === 0 || yearEntries.some(y => !/^\d{4}$/.test(y))) {
        showError('Enter one or more 4-digit admission years, comma-separated (e.g. "2025" or "2024,2025")');
        return;
      }
    }
    if (formEligibilityType === 'batch' && formBatches.length === 0) {
      showError('Pick at least one batch section');
      return;
    }
    setSavingConfig(true);
    try {
      await apiSetCohortTrackConfig(
        cohortId,
        formTrackSlug,
        formEligibilityType,
        formEligibilityType === 'year' ? yearEntries.join(',') : formEligibilityType === 'batch' ? formBatches.join(',') : undefined
      );
      showSuccess(editingTrackSlug ? 'Track configuration updated' : 'Track added to this OJT');
      setConfigModalOpen(false);
      await fetchData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save track configuration');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleRemoveConfig = async (config: ApiCohortTrackConfig) => {
    if (!cohortId) return;
    const confirmRemove = await confirm({
      title: 'Remove track from this OJT',
      message: `Remove "${config.trackName}" from this OJT? Students will no longer be able to pick it here.`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!confirmRemove) return;
    try {
      await apiRemoveCohortTrackConfig(cohortId, config.trackSlug);
      showSuccess('Track removed from this OJT');
      await fetchData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to remove track');
    }
  };

  // ── Manage-students modal (unique tracks) ──────────────────────────────────

  const openStudentsModal = (trackSlug: string) => {
    setStudentsModalTrackSlug(trackSlug);
    setRegNumbersInput('');
    setStudentSearch('');
    setStudentSearchInput('');
    setStudentBatchFilter('');
    setSearchResults([]);
    setPickedStudentIds(new Set());
  };

  const activeConfig = configs.find(c => c.trackSlug === studentsModalTrackSlug) ?? null;

  const runStudentSearch = useCallback(async () => {
    if (!cohortId || !studentsModalTrackSlug) return;
    if (!studentSearch && !studentBatchFilter) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await apiListStudentsPage({
        page: 1,
        limit: 20,
        cohortId,
        search: studentSearch || undefined,
        batch: studentBatchFilter || undefined,
      });
      setSearchResults(res.data);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to search students');
    } finally {
      setSearchLoading(false);
    }
  }, [cohortId, studentsModalTrackSlug, studentSearch, studentBatchFilter, showError]);

  useEffect(() => {
    runStudentSearch();
  }, [runStudentSearch]);

  const handleSearchInputChange = (value: string) => {
    setStudentSearchInput(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setStudentSearch(value), SEARCH_DEBOUNCE_MS);
  };

  const togglePicked = (studentId: string) => {
    setPickedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const handleAddStudents = async () => {
    if (!cohortId || !studentsModalTrackSlug) return;
    const registrationNumbers = regNumbersInput
      .split(/[,\n]/)
      .map(s => s.trim())
      .filter(Boolean);
    const studentIds = Array.from(pickedStudentIds);
    if (registrationNumbers.length === 0 && studentIds.length === 0) {
      showError('Paste at least one registration number or pick a student from search');
      return;
    }
    setAddingStudents(true);
    try {
      const res = await apiAddEligibleStudents(cohortId, studentsModalTrackSlug, { registrationNumbers, studentIds });
      if (res.unresolved.length > 0) {
        showError(`${res.added} added. Not found: ${res.unresolved.join(', ')}`);
      } else {
        showSuccess(`${res.added} student(s) added`);
      }
      setRegNumbersInput('');
      setPickedStudentIds(new Set());
      await fetchData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to add students');
    } finally {
      setAddingStudents(false);
    }
  };

  const handleRemoveStudent = async (student: ApiEligibleStudent) => {
    if (!cohortId || !studentsModalTrackSlug) return;
    try {
      await apiRemoveEligibleStudent(cohortId, studentsModalTrackSlug, student.studentId);
      showSuccess('Student removed');
      await fetchData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to remove student');
    }
  };

  return (
    <div className="space-y-6">
      <CohortPageHeader
        title="Track Configuration"
        subtitle={cohortLabel ? `${cohortLabel} — who can pick which track` : undefined}
        icon={Settings2}
      />

      {loading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setManageTracksOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-zinc-700 text-gray-300 font-semibold rounded-lg hover:text-white hover:border-gold/40 transition-colors text-sm"
            >
              <ListPlus size={16} />
              Manage Tracks
            </button>
            <button
              onClick={openAddModal}
              disabled={unconfiguredTracks.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              title={unconfiguredTracks.length === 0 ? 'Every track is already configured for this OJT' : undefined}
            >
              <Plus size={16} />
              Add Track to this OJT
            </button>
          </div>

          {configs.length === 0 ? (
            <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-8 text-center">
              <p className="text-gray-400 text-sm">No tracks configured yet. Students won't see any track options until you add at least one.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {configs.map(config => (
                <div key={config.trackSlug} className="bg-zinc-850 border border-zinc-750 rounded-xl p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-white font-semibold">{config.trackName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {config.eligibilityType === 'year' && `Admission year(s): ${(config.eligibilityValue ?? '').split(',').join(', ')}`}
                        {config.eligibilityType === 'batch' && `Batch section(s): ${(config.eligibilityValue ?? '').split(',').join(', ')}`}
                        {config.eligibilityType === 'unique' && `${config.eligibleStudents.length} named student(s)`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEditModal(config)}
                        className="text-xs px-2.5 py-1 rounded-lg text-gray-300 hover:text-white hover:bg-zinc-750 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleRemoveConfig(config)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Remove from this OJT"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {config.eligibilityType === 'unique' && (
                    <button
                      onClick={() => openStudentsModal(config.trackSlug)}
                      className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-gray-300 hover:text-white hover:border-gold/40 transition-colors"
                    >
                      <Users size={13} />
                      Manage students
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add/edit track config */}
      <Modal
        open={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        title={editingTrackSlug ? 'Edit Track Eligibility' : 'Add Track to this OJT'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Track</label>
            {editingTrackSlug ? (
              <p className="text-white font-medium px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm">
                {allTracks.find(t => t.slug === formTrackSlug)?.name ?? formTrackSlug}
              </p>
            ) : (
              <Select
                value={formTrackSlug}
                onChange={v => setFormTrackSlug(v as string)}
                options={unconfiguredTracks.map(t => ({ value: t.slug, label: t.name }))}
                className="w-full"
              />
            )}
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Who can pick this track</label>
            <Select
              value={formEligibilityType}
              onChange={v => setFormEligibilityType(v as TrackEligibilityType)}
              options={ELIGIBILITY_OPTIONS}
              className="w-full"
            />
          </div>

          {formEligibilityType === 'year' && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Admission year(s)</label>
              <input
                type="text"
                value={formYear}
                onChange={e => setFormYear(e.target.value)}
                placeholder="e.g. 2025 or 2024,2025"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition-all"
              />
              <p className="text-xs text-gray-500 mt-1">
                Every batch section from these admission year(s) can pick it — 2025 A, 2025 B, etc. Comma-separate to allow more than one year.
              </p>
            </div>
          )}

          {formEligibilityType === 'batch' && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Batch section(s)</label>
              {allowedBatches.length > 0 ? (
                <Select
                  value={formBatches}
                  onChange={v => setFormBatches(v as string[])}
                  options={allowedBatches.map(b => ({ value: b, label: b }))}
                  placeholder="Select one or more batches"
                  isMulti
                  className="w-full"
                />
              ) : (
                <input
                  type="text"
                  value={formBatches.join(',')}
                  onChange={e => setFormBatches(e.target.value.split(',').map(v => v.trim()).filter(Boolean))}
                  placeholder="e.g. 2025 A or 2025 A,2025 B"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition-all"
                />
              )}
              <p className="text-xs text-gray-500 mt-1">Only students in these exact batch section(s) can pick it.</p>
            </div>
          )}

          {formEligibilityType === 'unique' && (
            <p className="text-xs text-gray-500">
              Save this first, then use "Manage students" on the card to add specific students by registration number or search — they can span any batch.
            </p>
          )}

          <button
            onClick={handleSaveConfig}
            disabled={savingConfig || !formTrackSlug}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
          >
            {savingConfig ? 'Saving...' : editingTrackSlug ? 'Update' : 'Add Track'}
          </button>
        </div>
      </Modal>

      {/* Manage unique-track students */}
      <Modal
        open={!!studentsModalTrackSlug}
        onClose={() => setStudentsModalTrackSlug(null)}
        title={`Students eligible for ${activeConfig?.trackName ?? ''}`}
        size="lg"
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Bulk add by registration number</label>
            <textarea
              value={regNumbersInput}
              onChange={e => setRegNumbersInput(e.target.value)}
              placeholder="Paste registration numbers, one per line or comma-separated"
              rows={3}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition-all resize-none"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Or search &amp; pick students</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={studentSearchInput}
                onChange={e => handleSearchInputChange(e.target.value)}
                placeholder="Search by name or roll number..."
                className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition-all"
              />
              {allowedBatches.length > 0 && (
                <Select
                  value={studentBatchFilter}
                  onChange={v => setStudentBatchFilter(v as string)}
                  options={allowedBatches.map(b => ({ value: b, label: b }))}
                  placeholder="Any batch"
                  className="w-40"
                />
              )}
            </div>
            <div className="max-h-56 overflow-y-auto border border-zinc-700 rounded-lg divide-y divide-zinc-800">
              {searchLoading ? (
                <div className="p-4 flex justify-center"><SpinnerSquare size={24} /></div>
              ) : searchResults.length === 0 ? (
                <p className="text-xs text-gray-500 p-3">
                  {studentSearch || studentBatchFilter ? 'No students match.' : 'Type a search term or pick a batch to find students.'}
                </p>
              ) : (
                searchResults.map(s => (
                  <label key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-zinc-800/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pickedStudentIds.has(s.id)}
                      onChange={() => togglePicked(s.id)}
                      className="rounded bg-zinc-750 border-zinc-650 accent-gold focus:ring-gold"
                    />
                    <span className="flex-1">{s.fullName || '—'}</span>
                    <span className="text-xs text-gray-500">{s.rollNumber} · {s.batch}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <button
            onClick={handleAddStudents}
            disabled={addingStudents}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
          >
            {addingStudents ? 'Adding...' : 'Add to Eligible List'}
          </button>

          {activeConfig && activeConfig.eligibleStudents.length > 0 && (
            <div>
              <p className="text-sm text-gray-400 mb-2">Currently eligible ({activeConfig.eligibleStudents.length})</p>
              <div className="max-h-56 overflow-y-auto border border-zinc-700 rounded-lg divide-y divide-zinc-800">
                {activeConfig.eligibleStudents.map(s => (
                  <div key={s.studentId} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="flex-1 text-gray-300">{s.fullName || '—'}</span>
                    <span className="text-xs text-gray-500">{s.rollNumber} · {s.batch}</span>
                    <button
                      onClick={() => handleRemoveStudent(s)}
                      className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Remove"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      <ManageTracksModal
        open={manageTracksOpen}
        onClose={() => setManageTracksOpen(false)}
        tracks={allTracks}
        onChanged={refetchTracks}
      />
    </div>
  );
}
