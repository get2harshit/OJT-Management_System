import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Settings2, Plus, Pencil, Trash2, Users, X, UserPlus } from 'lucide-react';
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
  ApiCandidateMentor,
} from '../../../lib/api/tracks';
import { SUBMISSION_MODE_LABELS, apiGetTrackCandidateMentors } from '../../../lib/api/tracks';
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

const PROJECT_MODE_OPTIONS: { value: TrackProjectMode; label: string }[] = [
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
  const [formProjectMode, setFormProjectMode] = useState<TrackProjectMode>('team');
  // Mentors staffing the track(s) being configured, and what teams on them may
  // submit. Both are required by the backend — a track with no mentor leaves
  // students facing an empty dropdown at preference time.
  const [formMentorIds, setFormMentorIds] = useState<Set<string>>(new Set());
  const [formSubmissionModes, setFormSubmissionModes] = useState<TrackSubmissionMode[]>(['2_recommended']);
  const [candidateMentors, setCandidateMentors] = useState<ApiCandidateMentor[]>([]);
  const [mentorsLoading, setMentorsLoading] = useState(false);
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
  // picker only offers these (editing an existing row keeps its own track
  // fixed).
  const configuredSlugs = new Set(configs.map(c => c.trackSlug));
  const unconfiguredTracks = allTracks.filter(t => !configuredSlugs.has(t.slug));

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
    setTrackSource('existing');
    setNewTrackName('');
    setFormTrackSlugs([]);
    setFormEligibilityType('year');
    setFormYears([]);
    setFormBatches([]);
    setFormProjectMode('team');
    setFormMentorIds(new Set());
    setFormSubmissionModes(['2_recommended']);
    setCandidateMentors([]);
    setConfigModalOpen(true);
  };

  const openEditModal = (config: ApiCohortTrackConfig) => {
    setEditingTrackSlug(config.trackSlug);
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
    setFormMentorIds(new Set(config.mentors.map(m => m.mentorId)));
    setFormSubmissionModes(config.allowedSubmissionModes.length ? config.allowedSubmissionModes : ['2_recommended']);
    setCandidateMentors([]);
    setConfigModalOpen(true);
  };

  const toggleFormTrackSlug = (slug: string) => {
    setFormTrackSlugs(prev => (prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]));
  };

  const toggleFormMentor = (mentorId: string) => {
    setFormMentorIds(prev => {
      const next = new Set(prev);
      if (next.has(mentorId)) next.delete(mentorId);
      else next.add(mentorId);
      return next;
    });
  };

  const toggleSubmissionMode = (mode: TrackSubmissionMode) => {
    setFormSubmissionModes(prev => (prev.includes(mode) ? prev.filter(m => m !== mode) : [...prev, mode]));
  };

  // The mentor roster is the same list for every track — only the
  // already-assigned/expertise flags differ — so when several tracks are being
  // configured at once we load the flags for the first one and apply the same
  // mentors to all of them.
  const mentorFlagTrackSlug = editingTrackSlug ?? formTrackSlugs[0] ?? null;

  // A track being created has no slug yet, but its mentors still have to be
  // picked here — saving requires at least one. So the roster loads either
  // way; without a slug it just comes back with no expertise flags.
  const canPickMentors = !!mentorFlagTrackSlug || (!editingTrackSlug && trackSource === 'new');

  useEffect(() => {
    if (!configModalOpen || !cohortId || !canPickMentors) {
      if (configModalOpen && !canPickMentors) setCandidateMentors([]);
      return;
    }
    let cancelled = false;
    setMentorsLoading(true);
    apiGetTrackCandidateMentors(cohortId, mentorFlagTrackSlug)
      .then(rows => {
        if (cancelled) return;
        setCandidateMentors(rows);
        // On a fresh add, pre-tick the mentors whose declared expertise
        // already covers this track — the admin can still change it.
        if (!editingTrackSlug) {
          setFormMentorIds(prev =>
            prev.size > 0 ? prev : new Set(rows.filter(r => r.hasExpertise).map(r => r.mentorId))
          );
        }
      })
      .catch(err => showError(err instanceof Error ? err.message : 'Failed to load mentors'))
      .finally(() => {
        if (!cancelled) setMentorsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [configModalOpen, cohortId, mentorFlagTrackSlug, canPickMentors, editingTrackSlug, showError]);

  const handleSaveConfig = async () => {
    if (!cohortId) return;
    if (formEligibilityType === 'year' && formYears.length === 0) {
      showError('Pick at least one admission year');
      return;
    }
    if (formEligibilityType === 'batch' && formBatches.length === 0) {
      showError('Pick at least one batch section');
      return;
    }
    if (formMentorIds.size === 0) {
      showError('Assign at least one mentor — students on this track need someone to pick at project selection.');
      return;
    }
    if (formSubmissionModes.length === 0) {
      showError('Pick at least one project submission option');
      return;
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
          return;
        }
        const created = await apiCreateTrack(name);
        trackSlugs = [created.slug];
      }
      if (trackSlugs.length === 0) {
        showError('Pick at least one track');
        setSavingConfig(false);
        return;
      }

      const eligibilityValue =
        formEligibilityType === 'year' ? formYears.join(',') : formEligibilityType === 'batch' ? formBatches.join(',') : undefined;
      const mentorIds = Array.from(formMentorIds);
      await Promise.all(
        trackSlugs.map(slug =>
          apiSetCohortTrackConfig(cohortId, {
            trackSlug: slug,
            eligibilityType: formEligibilityType,
            eligibilityValue,
            projectMode: formProjectMode,
            mentorIds,
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
          <div className="flex justify-end">
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
                      <tr key={config.trackSlug} className="border-b border-zinc-800 last:border-0">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => navigate(`/admin/dashboard/ojts/${cohortId}/track-config/${config.trackSlug}/projects`)}
                            className="text-white font-medium hover:text-gold hover:underline underline-offset-4 transition-colors text-left"
                            title="Open this track's projects & CSV upload"
                          >
                            {config.trackName}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-gray-400">{ELIGIBILITY_LABELS[config.eligibilityType]}</td>
                        <td className="px-4 py-3 text-gray-300">
                          {config.eligibilityType === 'year' && (config.eligibilityValue ?? '').split(',').join(', ')}
                          {config.eligibilityType === 'batch' && (config.eligibilityValue ?? '').split(',').join(', ')}
                          {config.eligibilityType === 'unique' && (
                            <button
                              onClick={() => openStudentsModal(config.trackSlug)}
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
                            {config.eligibilityType === 'unique' && (
                              <button
                                onClick={() => navigate(`/admin/dashboard/ojts/${cohortId}/track-config/${config.trackSlug}/students`)}
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
                unconfiguredTracks.length === 0 ? (
                  <p className="text-xs text-gray-500">Every existing track is already configured for this OJT — create a new one instead.</p>
                ) : (
                  <div className="border border-zinc-700 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        const allSlugs = unconfiguredTracks.map(t => t.slug);
                        const allSelected = allSlugs.every(s => formTrackSlugs.includes(s));
                        setFormTrackSlugs(allSelected ? [] : allSlugs);
                      }}
                      className="w-full flex items-center px-3 py-2 text-sm text-blue-400 font-semibold hover:bg-zinc-800/60 transition-colors border-b border-zinc-750"
                    >
                      {unconfiguredTracks.every(t => formTrackSlugs.includes(t.slug)) ? 'Deselect All' : 'Select All'}
                    </button>
                    <div className="max-h-40 overflow-y-auto divide-y divide-zinc-800">
                      {unconfiguredTracks.map(t => (
                        <label key={t.slug} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-zinc-800/60 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formTrackSlugs.includes(t.slug)}
                            onChange={() => toggleFormTrackSlug(t.slug)}
                            className="rounded bg-zinc-750 border-zinc-650 accent-gold focus:ring-gold"
                          />
                          <span className="flex-1">{t.name}</span>
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
              onChange={v => setFormProjectMode(v as TrackProjectMode)}
              options={PROJECT_MODE_OPTIONS}
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-1">
              This forces the mode for every student on this track, except those already mandated individual by their batch or an admin override — they always stay individual.
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

          {/* Mentors staffing this track in this OJT */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Mentors for this track
              {formMentorIds.size > 0 && <span className="text-gold ml-1">({formMentorIds.size} selected)</span>}
            </label>

            {!canPickMentors ? (
              <p className="text-xs text-gray-500 px-3 py-2 rounded-lg bg-zinc-800/50">
                Pick a track first to choose its mentors.
              </p>
            ) : mentorsLoading ? (
              <p className="text-xs text-gray-500 px-3 py-2">Loading mentors...</p>
            ) : candidateMentors.length === 0 ? (
              <p className="text-xs text-amber-400/90 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                No mentors are part of this OJT yet. Add mentors to the OJT before configuring a track.
              </p>
            ) : (
              <div className="max-h-52 overflow-y-auto rounded-lg border border-zinc-800 divide-y divide-zinc-800">
                {candidateMentors.map(mentor => (
                  <label
                    key={mentor.mentorId}
                    className="flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-800/60 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={formMentorIds.has(mentor.mentorId)}
                      onChange={() => toggleFormMentor(mentor.mentorId)}
                      className="w-4 h-4 accent-gold shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-gray-200 truncate">{mentor.fullName ?? '—'}</span>
                      <span className="block text-xs text-gray-500 truncate">
                        {mentor.email ?? ''}
                        {mentor.organization ? ` · ${mentor.organization}` : ''}
                      </span>
                    </span>
                    {mentor.isExternal && (
                      <span className="text-[10px] uppercase tracking-wide text-gray-500 shrink-0">External</span>
                    )}
                    {mentor.hasExpertise && (
                      <span className="text-[10px] uppercase tracking-wide text-gold/70 shrink-0">Expertise</span>
                    )}
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Only these mentors appear when a team on this track picks its project.
              {formTrackSlugs.length > 1 && ' The same mentors are assigned to all selected tracks.'}
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
    </div>
  );
}
