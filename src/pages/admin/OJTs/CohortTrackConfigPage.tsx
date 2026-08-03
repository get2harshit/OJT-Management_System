import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Settings2, Plus, Pencil, Trash2, Users, X, UserPlus, ArrowRight } from 'lucide-react';
import CohortPageHeader from './CohortPageHeader';
import SpinnerSquare from '../../../components/SpinnerSquare';
import Select from '../../../components/Select';
import Modal from '../../../components/Modal';
import type {
  ApiCohortTrackConfig,
  TrackEligibilityType,
  TrackProjectMode,
  TrackSubmissionMode,
  ApiEligibleStudent,
} from '../../../lib/api/tracks';
import { SUBMISSION_MODE_LABELS } from '../../../lib/api/tracks';
import {
  apiGetCohort,
  apiGetCohortTrackConfig,
  apiSetCohortTrackConfig,
  apiRemoveCohortTrackConfig,
  apiAddEligibleStudents,
  apiRemoveEligibleStudent,
  apiListStudentsPage,
  apiCreateTrack,
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

const ELIGIBILITY_LABELS: Record<TrackEligibilityType, string> = {
  year: 'Admission year',
  batch: 'Batch section',
  unique: 'Specific students',
};

// '' means "don't send a mode" — the server then derives it from who the
// configuration is for (an individual-only admission year gets Individual,
// everyone else Team). Offered as a real choice rather than mirroring that
// rule here, because a copy of the year list in the client would drift from
// the one in domain/projectMode.ts the first time the programme changes.
type ProjectModeChoice = TrackProjectMode | '';

const PROJECT_MODE_OPTIONS: { value: ProjectModeChoice; label: string }[] = [
  { value: '', label: 'Automatic — decided by the batch this is for' },
  { value: 'individual', label: 'Individual — every student works solo on this track' },
  { value: 'team', label: 'Team — students must pair up to work on this track' },
];

const SEARCH_DEBOUNCE_MS = 400;

export default function CohortTrackConfigPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const confirm = useConfirm();
  const { tracks: allTracks, refetch: refetchTracks } = useTracks();

  const [cohortLabel, setCohortLabel] = useState('');
  const [allowedBatches, setAllowedBatches] = useState<string[]>([]);
  const [configs, setConfigs] = useState<ApiCohortTrackConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // Add/edit-track-config modal
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [editingTrackSlug, setEditingTrackSlug] = useState<string | null>(null);
  // The variant being edited. A track can be configured several times per
  // OJT, so the slug alone no longer says which row the form is writing to —
  // without this an edit of the 2025 configuration would overwrite the 2024 one.
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  // Only shown when adding (not editing) a track — pick one or more existing
  // not-yet-configured tracks via checkboxes (all get the same eligibility/
  // mode config below), or create a brand new one right here instead of
  // needing a separate "manage tracks" screen.
  const [trackSource, setTrackSource] = useState<'existing' | 'new'>('existing');
  const [newTrackName, setNewTrackName] = useState('');
  // Multiple tracks when adding (checkbox multi-select); always exactly one
  // entry when editing (that row's own track, fixed).
  const [formTrackSlugs, setFormTrackSlugs] = useState<string[]>([]);
  const [formEligibilityType, setFormEligibilityType] = useState<TrackEligibilityType>('year');
  // Multiple admission years can be picked at once (multi-select), same as batches.
  const [formYears, setFormYears] = useState<string[]>([]);
  // Multiple batch sections can be picked at once (multi-select).
  const [formBatches, setFormBatches] = useState<string[]>([]);
  // No default — admin must explicitly pick individual/team every time a
  // track is configured for this OJT, same as eligibility type.
  const [formProjectMode, setFormProjectMode] = useState<ProjectModeChoice>('');
  const [formSubmissionModes, setFormSubmissionModes] = useState<TrackSubmissionMode[]>(['2_recommended']);
  // Read-only here: mentors are staffed on their own screen, and this only
  // labels the link across to it.
  const [editingMentorCount, setEditingMentorCount] = useState(0);
  const [savingConfig, setSavingConfig] = useState(false);

  // Manage-students modal (only for 'unique' tracks)
  // Keyed by variant, not track: two configurations of one track each keep
  // their own hand-picked student list.
  const [studentsModalConfigId, setStudentsModalConfigId] = useState<string | null>(null);
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

  // Every active track is offerable, including ones already configured here:
  // adding Product Development a second time is how an admin gives the 2025
  // batch different rules from the 2024 batch. The server refuses only the
  // genuinely broken case — a second configuration covering the same students.
  const addableTracks = allTracks;

  // How many configurations each track has in this OJT, so a track that
  // appears more than once can be labelled to tell the rows apart.
  const configCountByTrack = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of configs) counts.set(c.trackSlug, (counts.get(c.trackSlug) ?? 0) + 1);
    return counts;
  }, [configs]);

  // What distinguishes this row from its siblings — shown only when there are
  // siblings, so a single-variant track stays as uncluttered as before.
  const variantSuffix = (config: ApiCohortTrackConfig): string | null => {
    if ((configCountByTrack.get(config.trackSlug) ?? 0) < 2) return null;
    if (config.variantLabel) return config.variantLabel;
    return config.eligibilityType === 'unique' ? 'specific students' : config.eligibilityValue;
  };

  // Where a per-variant sub-page lives. The path still keys on the slug; the
  // variant rides as a query param, which keeps every existing URL valid.
  const variantPath = (config: ApiCohortTrackConfig, page: string) =>
    `/admin/dashboard/ojts/${cohortId}/track-config/${config.trackSlug}/${page}?configId=${config.configId}`;

  // Admission years, derived from this cohort's own batch sections (e.g.
  // "2025 A" -> "2025") rather than any fixed/hardcoded range — so the
  // dropdown only ever offers years that actually exist for this OJT.
  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    for (const b of allowedBatches) {
      const match = b.match(/^(\d{4})/);
      if (match) years.add(match[1]);
    }
    return Array.from(years).sort().map(y => ({ value: y, label: y }));
  }, [allowedBatches]);

  const openAddModal = () => {
    setEditingTrackSlug(null);
    setEditingConfigId(null);
    setTrackSource('existing');
    setNewTrackName('');
    setFormTrackSlugs([]);
    setFormEligibilityType('year');
    setFormYears([]);
    setFormBatches([]);
    setFormProjectMode('');
    setEditingMentorCount(0);
    setFormSubmissionModes(['2_recommended']);
    setConfigModalOpen(true);
  };

  const openEditModal = (config: ApiCohortTrackConfig) => {
    setEditingTrackSlug(config.trackSlug);
    setEditingConfigId(config.configId);
    setFormTrackSlugs([config.trackSlug]);
    setFormEligibilityType(config.eligibilityType);
    setFormYears(
      config.eligibilityType === 'year'
        ? (config.eligibilityValue ?? '').split(',').map(v => v.trim()).filter(Boolean)
        : []
    );
    setFormBatches(
      config.eligibilityType === 'batch'
        ? (config.eligibilityValue ?? '').split(',').map(v => v.trim()).filter(Boolean)
        : []
    );
    setFormProjectMode(config.projectMode);
    setEditingMentorCount(config.mentors.length);
    setFormSubmissionModes(config.allowedSubmissionModes.length ? config.allowedSubmissionModes : ['2_recommended']);
    setConfigModalOpen(true);
  };

  const toggleFormTrackSlug = (slug: string) => {
    setFormTrackSlugs(prev => (prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]));
  };

  const toggleSubmissionMode = (mode: TrackSubmissionMode) => {
    setFormSubmissionModes(prev => (prev.includes(mode) ? prev.filter(m => m !== mode) : [...prev, mode]));
  };

  /**
   * Saves the form and returns the configurations it wrote, or null if it
   * didn't get that far. The return value is what lets "Save & choose mentors"
   * continue on to the mentor screen: a brand-new track has no slug — and a
   * brand-new configuration no id — until this runs, and that screen needs both.
   */
  const handleSaveConfig = async (): Promise<ApiCohortTrackConfig[] | null> => {
    if (!cohortId) return null;
    if (formEligibilityType === 'year' && formYears.length === 0) {
      showError('Pick at least one admission year');
      return null;
    }
    if (formEligibilityType === 'batch' && formBatches.length === 0) {
      showError('Pick at least one batch section');
      return null;
    }
    if (formSubmissionModes.length === 0) {
      showError('Pick at least one project submission option');
      return null;
    }
    setSavingConfig(true);
    try {
      // Adding (not editing) with a brand-new track name: create the track
      // in the master list first, then configure it for this OJT in the same
      // flow — no separate "manage tracks" screen needed. Existing-track
      // mode can have more than one slug checked — all of them get this same
      // eligibility/mode config, one apiSetCohortTrackConfig call each.
      let trackSlugs = formTrackSlugs;
      if (!editingTrackSlug && trackSource === 'new') {
        const name = newTrackName.trim();
        if (name.length < 2) {
          showError('Track name must be at least 2 characters');
          setSavingConfig(false);
          return null;
        }
        const created = await apiCreateTrack(name);
        trackSlugs = [created.slug];
      }
      if (trackSlugs.length === 0) {
        showError('Pick at least one track');
        setSavingConfig(false);
        return null;
      }

      const eligibilityValue =
        formEligibilityType === 'year' ? formYears.join(',') : formEligibilityType === 'batch' ? formBatches.join(',') : undefined;
      // mentorIds is deliberately absent: this form no longer edits staffing,
      // and sending an empty array would unassign every mentor on the track.
      const saved = await Promise.all(
        trackSlugs.map(slug =>
          apiSetCohortTrackConfig(cohortId, {
            trackSlug: slug,
            // Only set when editing. Absent, the server adds another
            // configuration to the track rather than overwriting the existing
            // one — which is what makes per-batch variants possible at all.
            configId: editingConfigId ?? undefined,
            eligibilityType: formEligibilityType,
            eligibilityValue,
            projectMode: formProjectMode || undefined,
            allowedSubmissionModes: formSubmissionModes,
          })
        )
      );
      showSuccess(
        editingTrackSlug
          ? 'Track configuration updated'
          : trackSlugs.length > 1
            ? `${trackSlugs.length} tracks added to this OJT`
            : 'Track added to this OJT'
      );
      setConfigModalOpen(false);
      await refetchTracks();
      await fetchData();
      return saved;
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save track configuration');
      return null;
    } finally {
      setSavingConfig(false);
    }
  };

  // "Choose mentors" from inside the form. An existing track can be opened
  // straight away; a new one has to be saved first to exist at all, so this
  // does that save and carries on to the same screen rather than making the
  // admin close the modal, find the row and click again.
  const handleGoToMentors = async () => {
    if (!cohortId) return;
    if (editingTrackSlug && editingConfigId) {
      navigate(
        `/admin/dashboard/ojts/${cohortId}/track-config/${editingTrackSlug}/mentors?configId=${editingConfigId}`
      );
      return;
    }
    const saved = await handleSaveConfig();
    // Several tracks can be configured in one go; the mentor screen handles
    // one at a time, so the rest are reachable from their rows.
    if (saved?.length) {
      navigate(variantPath(saved[0], 'mentors'));
    }
  };

  const handleRemoveConfig = async (config: ApiCohortTrackConfig) => {
    if (!cohortId) return;
    const suffix = variantSuffix(config);
    const confirmRemove = await confirm({
      title: 'Remove track from this OJT',
      // Named by variant when there is more than one, so an admin can see
      // which audience they are about to cut loose.
      message: `Remove "${config.trackName}${suffix ? ` (${suffix})` : ''}" from this OJT? Students will no longer be able to pick it here.`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!confirmRemove) return;
    try {
      await apiRemoveCohortTrackConfig(cohortId, config.trackSlug, config.configId);
      showSuccess('Track removed from this OJT');
      await fetchData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to remove track');
    }
  };

  // ── Manage-students modal (unique tracks) ──────────────────────────────────

  const openStudentsModal = (configId: string) => {
    setStudentsModalConfigId(configId);
    setRegNumbersInput('');
    setStudentSearch('');
    setStudentSearchInput('');
    setStudentBatchFilter('');
    setSearchResults([]);
    setPickedStudentIds(new Set());
  };

  const activeConfig = configs.find(c => c.configId === studentsModalConfigId) ?? null;

  const runStudentSearch = useCallback(async () => {
    if (!cohortId || !activeConfig) return;
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
  }, [cohortId, activeConfig, studentSearch, studentBatchFilter, showError]);

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
    if (!cohortId || !activeConfig) return;
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
      const res = await apiAddEligibleStudents(cohortId, activeConfig.trackSlug, { registrationNumbers, studentIds }, activeConfig.configId);
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
    if (!cohortId || !activeConfig) return;
    try {
      await apiRemoveEligibleStudent(cohortId, activeConfig.trackSlug, student.studentId, activeConfig.configId);
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
          <div className="flex justify-end">
            <button
              onClick={openAddModal}
              disabled={addableTracks.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              title={addableTracks.length === 0 ? 'No tracks exist yet — create one first' : undefined}
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
            <div className="bg-zinc-850 border border-zinc-750 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-750 text-left text-gray-400 text-xs uppercase tracking-wider">
                      <th className="px-4 py-3">Track</th>
                      <th className="px-4 py-3">Who can pick this track</th>
                      <th className="px-4 py-3">Track can go</th>
                      <th className="px-4 py-3">Project mode</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {configs.map(config => (
                      <tr key={config.configId} className="border-b border-zinc-800 last:border-0">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => navigate(variantPath(config, 'projects'))}
                            className="text-white font-medium hover:text-gold hover:underline underline-offset-4 transition-colors text-left"
                            title="Open this track's projects & CSV upload"
                          >
                            {config.trackName}
                          </button>
                          {/* Only rendered when the track really is configured
                              more than once — otherwise every row would carry a
                              redundant restatement of its own eligibility. */}
                          {variantSuffix(config) && (
                            <span className="block text-xs text-gray-500 mt-0.5">{variantSuffix(config)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-400">{ELIGIBILITY_LABELS[config.eligibilityType]}</td>
                        <td className="px-4 py-3 text-gray-300">
                          {config.eligibilityType === 'year' && (config.eligibilityValue ?? '').split(',').join(', ')}
                          {config.eligibilityType === 'batch' && (config.eligibilityValue ?? '').split(',').join(', ')}
                          {config.eligibilityType === 'unique' && (
                            <button
                              onClick={() => openStudentsModal(config.configId)}
                              className="flex items-center gap-1.5 text-gold hover:underline"
                            >
                              <Users size={13} />
                              {config.eligibleStudents.length} named student(s)
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-300">
                          {config.projectMode === 'individual' ? 'Individual only' : 'Team required'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {/* A track with nobody on it is a dead end — students
                                reach project submission and find an empty mentor
                                list — so its own entry point carries the warning
                                rather than sitting quietly among the others. */}
                            <button
                              onClick={() => navigate(variantPath(config, 'mentors'))}
                              className={`p-1.5 rounded-lg transition-colors ${
                                config.mentors.length === 0
                                  ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                                  : 'text-gray-400 hover:text-gold hover:bg-zinc-750'
                              }`}
                              title={
                                config.mentors.length === 0
                                  ? 'No mentors on this track — students can’t pick anyone'
                                  : `Mentors (${config.mentors.length})`
                              }
                            >
                              <Users size={14} />
                            </button>
                            {config.eligibilityType === 'unique' && (
                              <button
                                onClick={() => navigate(variantPath(config, 'students'))}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gold hover:bg-zinc-750 transition-colors"
                                title="Add students by performance"
                              >
                                <UserPlus size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => openEditModal(config)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-750 transition-colors"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => handleRemoveConfig(config)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              title="Remove from this OJT"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
          {editingTrackSlug ? (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Track</label>
              <p className="text-white font-medium px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm">
                {allTracks.find(t => t.slug === editingTrackSlug)?.name ?? editingTrackSlug}
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Track</label>
              <div className="flex gap-2 mb-2">
                <label className="flex items-center gap-1.5 text-sm text-gray-300 cursor-pointer">
                  <input
                    type="radio"
                    checked={trackSource === 'existing'}
                    onChange={() => setTrackSource('existing')}
                    className="accent-gold"
                  />
                  Existing track
                </label>
                <label className="flex items-center gap-1.5 text-sm text-gray-300 cursor-pointer ml-4">
                  <input
                    type="radio"
                    checked={trackSource === 'new'}
                    onChange={() => setTrackSource('new')}
                    className="accent-gold"
                  />
                  New track
                </label>
              </div>

              {trackSource === 'existing' ? (
                addableTracks.length === 0 ? (
                  <p className="text-xs text-gray-500">No tracks exist yet — create a new one instead.</p>
                ) : (
                  <div className="border border-zinc-700 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        const allSlugs = addableTracks.map(t => t.slug);
                        const allSelected = allSlugs.every(s => formTrackSlugs.includes(s));
                        setFormTrackSlugs(allSelected ? [] : allSlugs);
                      }}
                      className="w-full flex items-center px-3 py-2 text-sm text-blue-400 font-semibold hover:bg-zinc-800/60 transition-colors border-b border-zinc-750"
                    >
                      {addableTracks.every(t => formTrackSlugs.includes(t.slug)) ? 'Deselect All' : 'Select All'}
                    </button>
                    <div className="max-h-40 overflow-y-auto divide-y divide-zinc-800">
                      {addableTracks.map(t => (
                        <label key={t.slug} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-zinc-800/60 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formTrackSlugs.includes(t.slug)}
                            onChange={() => toggleFormTrackSlug(t.slug)}
                            className="rounded bg-zinc-750 border-zinc-650 accent-gold focus:ring-gold"
                          />
                          <span className="flex-1">{t.name}</span>
                          {/* Picking it again adds another configuration rather
                              than replacing the existing one — worth saying, since
                              the old form refused this outright. */}
                          {(configCountByTrack.get(t.slug) ?? 0) > 0 && (
                            <span className="text-xs text-gray-500">
                              {configCountByTrack.get(t.slug)} already · adds another
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                )
              ) : (
                <input
                  type="text"
                  value={newTrackName}
                  onChange={e => setNewTrackName(e.target.value)}
                  placeholder="e.g. Blockchain Development"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition-all"
                />
              )}
            </div>
          )}

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
              {yearOptions.length > 0 ? (
                <Select
                  value={formYears}
                  onChange={v => setFormYears(v as string[])}
                  options={yearOptions}
                  placeholder="Select one or more years"
                  isMulti
                  className="w-full"
                />
              ) : (
                <p className="text-xs text-gray-500">This OJT has no batch sections set up yet, so no admission years are available.</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Every batch section from these admission year(s) can pick it — 2025 A, 2025 B, etc.
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
              Save this first, then click the student count in the table to add specific students by registration number or search — they can span any batch.
            </p>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Project mode for this track</label>
            <Select
              value={formProjectMode}
              onChange={v => setFormProjectMode(v as ProjectModeChoice)}
              options={PROJECT_MODE_OPTIONS}
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-1">
              {formProjectMode === ''
                ? 'The 2024 batch works solo; every other batch pairs up. Pick a mode above to override that.'
                : 'This forces the mode for every student on this track, except those already mandated individual by their batch or an admin override — they always stay individual.'}
            </p>
          </div>

          {/* What a team on this track may submit */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">What students can submit</label>
            <div className="space-y-1.5">
              {(Object.keys(SUBMISSION_MODE_LABELS) as TrackSubmissionMode[]).map(mode => (
                <label
                  key={mode}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={formSubmissionModes.includes(mode)}
                    onChange={() => toggleSubmissionMode(mode)}
                    className="w-4 h-4 accent-gold shrink-0"
                  />
                  <span className="text-sm text-gray-200">{SUBMISSION_MODE_LABELS[mode]}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Pick every option you want to offer — each team chooses one of them when submitting.
            </p>
          </div>

          {/* Mentors are staffed on their own screen — see the note on
              editingTrackSlug below for why this is a link rather than a
              picker. */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Mentors for this track</label>

            <button
              type="button"
              onClick={handleGoToMentors}
              disabled={savingConfig}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-zinc-750 bg-zinc-850 hover:border-gold/50 hover:bg-zinc-800 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="flex items-center gap-2 min-w-0">
                <Users size={15} className="text-gold shrink-0" />
                <span className="text-sm text-gray-200 truncate">
                  {!editingTrackSlug
                    ? 'Save track & choose mentors'
                    : editingMentorCount === 0
                      ? 'No mentors yet — choose who staffs this track'
                      : `${editingMentorCount} mentor${editingMentorCount === 1 ? '' : 's'} — change who staffs this track`}
                </span>
              </span>
              <ArrowRight size={15} className="text-gray-500 shrink-0" />
            </button>

            <p className="text-xs text-gray-500 mt-1">
              Only these mentors appear when a team on this track picks its project.
              {!editingTrackSlug
                ? ' A track has to exist before mentors can be attached to it, so this saves it first.'
                : ' Assigning them is a separate step, so this form never changes them.'}
            </p>
          </div>

          <button
            onClick={handleSaveConfig}
            disabled={
              savingConfig ||
              (editingTrackSlug
                ? formTrackSlugs.length === 0
                : trackSource === 'existing'
                  ? formTrackSlugs.length === 0
                  : newTrackName.trim().length < 2)
            }
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
          >
            {savingConfig ? 'Saving...' : editingTrackSlug ? 'Update' : formTrackSlugs.length > 1 ? `Add ${formTrackSlugs.length} Tracks` : 'Add Track'}
          </button>
        </div>
      </Modal>

      {/* Manage unique-track students */}
      <Modal
        open={!!studentsModalConfigId}
        onClose={() => setStudentsModalConfigId(null)}
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
    </div>
  );
}
