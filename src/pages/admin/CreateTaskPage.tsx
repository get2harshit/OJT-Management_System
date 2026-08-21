import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Target,
  Users,
  UserCheck,
  Sparkles,
  Layers,
  Clock,
  Send,
  FileText,
  ListChecks,
  MessageSquareText,
  Plus,
  X
} from 'lucide-react';
import Select from '../../components/Select';
import Button from '../../components/Button';
import AssigneePickerTable, { dedupeStudentRows } from '../../components/AssigneePickerTable';
import type { AssigneePickerStudentRow, AssigneePickerTeamRow } from '../../components/AssigneePickerTable';
import { useTracks } from '../../hooks/useTracks';
import { apiCreateTask } from '../../lib/api/tasks';
import type { ApiTaskCategory } from '../../lib/api/tasks';
import { apiListMentors } from '../../lib/api/mentors';
import { apiListStudents } from '../../lib/api/students';
import { apiGetTeamsForCohortDetailed } from '../../lib/api/allocations';
import type { ApiMentor, Cohort } from '../../lib/types';
import { useToast } from '../../toast';
import { apiListCohorts } from '../../lib/api';
import { usePageRefresh } from '../../context/RefreshContext';

const WEEKS = Array.from({ length: 12 }, (_, i) => i + 1);

const TASK_CATEGORY_OPTIONS: { value: ApiTaskCategory; label: string }[] = [
  { value: 'document_submission', label: 'Document Submission' },
  { value: 'general', label: 'General (Text Response)' },
  { value: 'link_submission', label: 'Link Submission' },
];

const MENTOR_CONTENT_MODE_OPTIONS: { value: 'checklist' | 'questions' | 'both'; label: string }[] = [
  { value: 'checklist', label: 'Checklist' },
  { value: 'questions', label: 'Questions' },
  { value: 'both', label: 'Both' },
];

export default function CreateTaskPage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const { tracks, options: trackOptions } = useTracks();
  const trackNameBySlug = useMemo(() => new Map(tracks.map((t) => [t.slug, t.name])), [tracks]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [mentors, setMentors] = useState<ApiMentor[]>([]);
  const [saving, setSaving] = useState(false);

  // A task now carries a real set of tracks (isMulti) — this is the actual
  // fix for a real bug hit in testing: selecting all 5 tracks under the old
  // single-value Select sent "Product Development, Application
  // Development, ..." as one comma-joined string and crashed Prisma with
  // "Invalid value for argument track".
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);
  // Narrows the assignee-picker table below (both students and teams);
  // sent to the API alongside track so the candidate pool stays server-
  // filtered rather than fetched whole and sliced client-side.
  const [batchFilter, setBatchFilter] = useState('');
  const [studentCandidates, setStudentCandidates] = useState<AssigneePickerStudentRow[]>([]);
  const [teamCandidates, setTeamCandidates] = useState<AssigneePickerTeamRow[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  // Student ids (individual mode) or team ids (team mode) — cleared
  // whenever the track/batch/mode selection changes, since the pool it was
  // built against no longer applies.
  const [selectedAssignees, setSelectedAssignees] = useState<Set<string>>(new Set());

  const [form, setForm] = useState({
    title: '',
    description: '',
    start_date: '',
    due_date: '',
    targetRole: 'student' as 'student' | 'mentor',
    assignMode: 'individual' as 'individual' | 'team',
    assigned_to: [] as string[], // mentor-target only — students/teams use selectedAssignees
    week_number: '1',
    category: 'document_submission' as ApiTaskCategory,
  });
  // Replaces the student-target Category picker entirely when targetRole is
  // 'mentor' — a mentor task is always one of exactly these 3 shapes, never
  // a document/link submission. Drives which of the two builders below show.
  const [mentorContentMode, setMentorContentMode] = useState<'checklist' | 'questions' | 'both'>('checklist');
  // Admin-defined structure for a mentor-targeted task only — a plain
  // string per row while editing (blank rows filtered out on submit), not
  // yet the {label}/{question} shape the API expects.
  const [checklistItems, setChecklistItems] = useState<string[]>([]);
  const [qnaQuestions, setQnaQuestions] = useState<string[]>([]);

  const loadMentorsAndCohorts = useCallback(() => {
    return Promise.all([apiListMentors(), apiListCohorts()])
      .then(([mentorsRes, cohortsRes]) => {
        setMentors(mentorsRes || []);
        setCohorts(cohortsRes || []);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    loadMentorsAndCohorts();
  }, [loadMentorsAndCohorts]);

  // Every task is created under whichever cohort is currently active — the
  // form has no cohort picker of its own, it just targets "the" running
  // cohort, same assumption the due-date auto-calculation below already made.
  const activeCohort = useMemo(
    () => cohorts.find(c => c.isActive) || cohorts[0],
    [cohorts]
  );

  // Batch options come from the cohort's own allowedBatches — matches the
  // candidate pool regardless of which track(s) are selected.
  const uniqueBatches = activeCohort?.allowedBatches || [];
  const batchOptions = [{ value: '', label: 'All Batches' }, ...uniqueBatches.map(b => ({ value: b, label: b }))];

  // The assignable student pool for the picker table — one apiListStudents
  // call per selected track (the endpoint takes a single track), merged and
  // deduped client-side. publishedOnly means a student whose team
  // allocation isn't visible to them yet can never be picked here (they'd
  // just be silently dropped by TaskService's own publish gate on save).
  const loadStudentCandidates = useCallback(() => {
    if (form.targetRole !== 'student' || selectedTracks.length === 0) {
      setStudentCandidates([]);
      return Promise.resolve();
    }
    setCandidatesLoading(true);
    return Promise.all(
      selectedTracks.map((track) =>
        apiListStudents({ batch: batchFilter ? [batchFilter] : undefined, track, publishedOnly: true })
          // ApiStudent.track isn't reliably populated (a student's real
          // track lives on their team's track_id, not a direct column —
          // apiListStudents filters via that join, per StudentRepository).
          // Tag rows with the track this specific call was scoped to
          // instead of trusting s.track, or the picker's Track column
          // shows blank for real students.
          .then((students) => students.map((s) => ({ ...s, queriedTrack: track })))
      )
    )
      .then((results) => {
        const rows: AssigneePickerStudentRow[] = results.flat().map((s) => ({
          id: s.id,
          fullName: s.fullName ?? null,
          batch: s.batch ?? null,
          track: s.queriedTrack,
          rollNumber: s.rollNumber ?? null,
        }));
        setStudentCandidates(dedupeStudentRows(rows));
      })
      .catch(console.error)
      .finally(() => setCandidatesLoading(false));
  }, [form.targetRole, selectedTracks, batchFilter]);

  // Same merge-per-track approach for teams — apiGetTeamsForCohortDetailed
  // also takes one track at a time. status: 'published' matches the same
  // gate TaskService applies on save, so nothing shows here that would just
  // get silently filtered out at submit time.
  const loadTeamCandidates = useCallback(() => {
    if (form.targetRole !== 'student' || form.assignMode !== 'team' || selectedTracks.length === 0 || !activeCohort) {
      setTeamCandidates([]);
      return Promise.resolve();
    }
    setCandidatesLoading(true);
    return Promise.all(
      selectedTracks.map((track) =>
        apiGetTeamsForCohortDetailed(activeCohort.id, {
          track,
          batch: batchFilter || undefined,
          status: 'published',
          limit: 200,
          skipCount: true,
        })
      )
    )
      .then((pages) => {
        const merged = new Map<string, AssigneePickerTeamRow>();
        pages.forEach((page) => {
          page.data.forEach((t) => {
            merged.set(t.teamId, {
              id: t.teamId,
              teamName: t.teamName,
              track: t.track,
              memberNames: t.members.map((m) => m.fullName || 'Unnamed'),
            });
          });
        });
        setTeamCandidates(Array.from(merged.values()));
      })
      .catch(console.error)
      .finally(() => setCandidatesLoading(false));
  }, [form.targetRole, form.assignMode, selectedTracks, batchFilter, activeCohort]);

  useEffect(() => {
    loadStudentCandidates();
  }, [loadStudentCandidates]);

  useEffect(() => {
    loadTeamCandidates();
  }, [loadTeamCandidates]);

  usePageRefresh(
    useCallback(
      () => Promise.all([loadMentorsAndCohorts(), loadStudentCandidates(), loadTeamCandidates()]),
      [loadMentorsAndCohorts, loadStudentCandidates, loadTeamCandidates]
    )
  );

  const mentorAssignableList = mentors.map(m => ({ id: m.id, label: m.fullName || m.email || m.id }));

  const handleSave = async () => {
    if (!form.title) {
      showError('Task title is required');
      return;
    }
    if (selectedTracks.length === 0) {
      showError('Select at least one track');
      return;
    }
    if (!form.start_date) {
      showError('Start date is required');
      return;
    }
    if (!form.due_date) {
      showError('Due date is required');
      return;
    }
    if (new Date(form.start_date) >= new Date(form.due_date)) {
      showError('Start date must be before due date');
      return;
    }
    if (!activeCohort) {
      showError('No active cohort found — a task must belong to a running cohort');
      return;
    }
    if (form.targetRole === 'student' && selectedAssignees.size === 0) {
      showError(form.assignMode === 'team' ? 'Select at least one team' : 'Select at least one student');
      return;
    }
    if (form.targetRole === 'mentor' && form.assigned_to.length === 0) {
      showError('Select at least one mentor');
      return;
    }

    // Blank rows are just in-progress editing state, never sent — a row is
    // only "real" once it has actual text in it.
    const trimmedChecklist = checklistItems.map(s => s.trim()).filter(Boolean);
    const trimmedQna = qnaQuestions.map(s => s.trim()).filter(Boolean);

    if (form.targetRole === 'mentor') {
      const needsChecklist = mentorContentMode === 'checklist' || mentorContentMode === 'both';
      const needsQna = mentorContentMode === 'questions' || mentorContentMode === 'both';
      if (needsChecklist && trimmedChecklist.length === 0) {
        showError('Add at least one checklist item');
        return;
      }
      if (needsQna && trimmedQna.length === 0) {
        showError('Add at least one question');
        return;
      }
    }

    setSaving(true);
    try {
      await apiCreateTask({
        title: form.title,
        description: form.description || undefined,
        target_role: form.targetRole,
        // A mentor task is always exactly one of checklist/questions/both —
        // never a document/link submission, so category is fixed to
        // 'general' rather than exposed as a picker (see mentorContentMode).
        category: form.targetRole === 'mentor' ? 'general' : form.category,
        assign_mode: form.targetRole === 'student' ? form.assignMode : 'individual',
        assignees: form.targetRole === 'mentor'
          ? form.assigned_to
          : form.assignMode === 'individual' ? Array.from(selectedAssignees) : undefined,
        teamIds: form.targetRole === 'student' && form.assignMode === 'team' ? Array.from(selectedAssignees) : undefined,
        start_date: new Date(form.start_date).toISOString(),
        deadline: new Date(form.due_date).toISOString(),
        week: `Week ${form.week_number}`,
        tracks: selectedTracks,
        cohort_id: activeCohort.id,
        checklist_items: form.targetRole === 'mentor' && (mentorContentMode === 'checklist' || mentorContentMode === 'both')
          ? trimmedChecklist.map(label => ({ label }))
          : undefined,
        qna_questions: form.targetRole === 'mentor' && (mentorContentMode === 'questions' || mentorContentMode === 'both')
          ? trimmedQna.map(question => ({ question }))
          : undefined,
      });
      showSuccess('Task created successfully');
      navigate('/admin/dashboard?tab=tasks');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create task');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full h-full min-h-0 flex flex-col">
      {/* Top Page Bar — fixed, doesn't scroll with the form content below */}
      <div className="shrink-0 flex items-center justify-between flex-wrap gap-4 border-b border-zinc-750/60 pb-5 mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admin/dashboard?tab=tasks')}
            className="p-2.5 rounded-xl bg-zinc-850 hover:bg-zinc-750 text-gray-400 hover:text-white border border-zinc-750 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-white tracking-tight">Create New Task / Goal</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gold/15 text-gold border border-gold/30">
                New Goal
              </span>
            </div>
            <p className="text-gray-400 text-sm mt-1">Configure and assign a new task to students or mentors across cohorts</p>
          </div>
        </div>
      </div>

      {/* Main 2-Column Workspace — the only scrollable region on this page */}
      <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 lg:grid-cols-3 gap-6 pb-6">

        {/* Left 2 Columns: the field order the admin actually works through —
            Task Type -> Track -> Team/Students -> Category -> Title -> Date */}
        <div className="lg:col-span-2 space-y-6">

          {/* Card 1: Task Type */}
          <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-6 space-y-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-750 pb-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Users size={18} className="text-gold" />
                1. Task Type
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => {
                  setForm({ ...form, targetRole: 'student', assigned_to: [] });
                  setChecklistItems([]);
                  setQnaQuestions([]);
                  setSelectedAssignees(new Set());
                }}
                className={`p-4 rounded-xl border flex items-center gap-4 text-left transition-all duration-200 ${
                  form.targetRole === 'student'
                    ? 'bg-blue-500/10 border-blue-500 text-white shadow-lg shadow-blue-500/5'
                    : 'bg-zinc-900 border-zinc-750 text-gray-400 hover:border-zinc-600'
                }`}
              >
                <div className={`p-3 rounded-lg ${form.targetRole === 'student' ? 'bg-blue-500 text-white' : 'bg-zinc-800 text-gray-400'}`}>
                  <Users size={22} />
                </div>
                <div>
                  <p className="font-semibold text-sm text-white">Assign to Students</p>
                  <p className="text-xs text-gray-400 mt-0.5">Scope goals to student tracks & batches</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setForm({ ...form, targetRole: 'mentor', assignMode: 'individual', assigned_to: [] });
                  setSelectedAssignees(new Set());
                }}
                className={`p-4 rounded-xl border flex items-center gap-4 text-left transition-all duration-200 ${
                  form.targetRole === 'mentor'
                    ? 'bg-purple-500/10 border-purple-500 text-white shadow-lg shadow-purple-500/5'
                    : 'bg-zinc-900 border-zinc-750 text-gray-400 hover:border-zinc-600'
                }`}
              >
                <div className={`p-3 rounded-lg ${form.targetRole === 'mentor' ? 'bg-purple-500 text-white' : 'bg-zinc-800 text-gray-400'}`}>
                  <UserCheck size={22} />
                </div>
                <div>
                  <p className="font-semibold text-sm text-white">Assign to Mentors</p>
                  <p className="text-xs text-gray-400 mt-0.5">Assign milestones to cohort mentors</p>
                </div>
              </button>
            </div>

            {/* Task Structure — replaces the student-target Category picker
                entirely for a mentor task: it's always exactly one of these
                3 shapes (never a document/link submission), so this is the
                single choice that decides both what gets built below and
                what category the backend receives. */}
            {form.targetRole === 'mentor' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">Task Type</label>
                  <Select
                    value={mentorContentMode}
                    onChange={v => setMentorContentMode(v as 'checklist' | 'questions' | 'both')}
                    options={MENTOR_CONTENT_MODE_OPTIONS}
                    className="w-full"
                  />
                </div>

                {(mentorContentMode === 'checklist' || mentorContentMode === 'both') && (
                  <div>
                    <label className="flex items-center gap-2 text-xs text-gray-400 mb-2 font-medium uppercase tracking-wider">
                      <ListChecks size={14} className="text-purple-400" />
                      Checklist Items *
                    </label>
                    <div className="space-y-2">
                      {checklistItems.map((value, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={value}
                            onChange={e => {
                              const next = [...checklistItems];
                              next[index] = e.target.value;
                              setChecklistItems(next);
                            }}
                            placeholder={`Checklist item ${index + 1}`}
                            className="flex-1 bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold transition-colors placeholder-gray-500"
                          />
                          <button
                            type="button"
                            onClick={() => setChecklistItems(checklistItems.filter((_, i) => i !== index))}
                            className="p-2 text-gray-500 hover:text-red-400 transition-colors shrink-0"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setChecklistItems([...checklistItems, ''])}
                        className="flex items-center gap-1.5 text-xs text-gold hover:text-gold-hover font-medium transition-colors"
                      >
                        <Plus size={14} /> Add checklist item
                      </button>
                    </div>
                  </div>
                )}

                {(mentorContentMode === 'questions' || mentorContentMode === 'both') && (
                  <div>
                    <label className="flex items-center gap-2 text-xs text-gray-400 mb-2 font-medium uppercase tracking-wider">
                      <MessageSquareText size={14} className="text-purple-400" />
                      Questions *
                    </label>
                    <div className="space-y-2">
                      {qnaQuestions.map((value, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={value}
                            onChange={e => {
                              const next = [...qnaQuestions];
                              next[index] = e.target.value;
                              setQnaQuestions(next);
                            }}
                            placeholder={`Question ${index + 1}`}
                            className="flex-1 bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold transition-colors placeholder-gray-500"
                          />
                          <button
                            type="button"
                            onClick={() => setQnaQuestions(qnaQuestions.filter((_, i) => i !== index))}
                            className="p-2 text-gray-500 hover:text-red-400 transition-colors shrink-0"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setQnaQuestions([...qnaQuestions, ''])}
                        className="flex items-center gap-1.5 text-xs text-gold hover:text-gold-hover font-medium transition-colors"
                      >
                        <Plus size={14} /> Add question
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Card 2: Track (multi-select) */}
          <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-6 space-y-3 shadow-sm">
            <h2 className="text-base font-semibold text-white flex items-center gap-2 border-b border-zinc-750 pb-4">
              <Layers size={18} className="text-gold" />
              2. Track
            </h2>
            <Select
              isMulti
              value={selectedTracks}
              onChange={v => {
                setSelectedTracks(v as string[]);
                setSelectedAssignees(new Set());
              }}
              className="w-full"
              placeholder="Select track(s)..."
              options={trackOptions}
            />
            <p className="text-[11px] text-gray-500">
              A task can span more than one track — the pool below fills with every matching track's students/teams, and the task shows up under a list filter on any of them.
            </p>
          </div>

          {/* Card 3: Team/Students (or Mentors) */}
          <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-6 space-y-3 shadow-sm">
            <div className="flex justify-between items-center border-b border-zinc-750 pb-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Users size={18} className="text-gold" />
                3. {form.targetRole === 'student' ? 'Team / Students' : 'Mentors'}
              </h2>
              <span className="text-xs text-gray-500">
                {form.targetRole === 'student' ? `${selectedAssignees.size} selected` : `${form.assigned_to.length} selected`}
              </span>
            </div>

            {form.targetRole === 'student' ? (
              selectedTracks.length === 0 ? (
                <p className="text-sm text-gray-500 py-8 text-center">Select a track above to see who can be assigned.</p>
              ) : (
                <AssigneePickerTable
                  mode={form.assignMode}
                  onModeChange={(mode) => {
                    setForm(prev => ({ ...prev, assignMode: mode }));
                    setSelectedAssignees(new Set());
                  }}
                  studentRows={studentCandidates}
                  teamRows={teamCandidates}
                  batchOptions={batchOptions}
                  batchFilter={batchFilter}
                  onBatchFilterChange={(v) => {
                    setBatchFilter(v);
                    setSelectedAssignees(new Set());
                  }}
                  trackNameBySlug={trackNameBySlug}
                  selected={selectedAssignees}
                  onSelectedChange={setSelectedAssignees}
                  loading={candidatesLoading}
                />
              )
            ) : (
              <>
                <Select
                  isMulti
                  isSearchable
                  value={form.assigned_to}
                  onChange={v => setForm({ ...form, assigned_to: v as string[] })}
                  className="w-full"
                  placeholder="Search and select mentor(s)..."
                  options={mentorAssignableList.map(a => ({ value: a.id, label: a.label }))}
                />
              </>
            )}
            {form.targetRole === 'student' && (
              <p className="text-[11px] text-gray-500">
                Only students whose team's project allocation has been published are shown here.
              </p>
            )}
          </div>

          {/* Card 4: Category (student only) + Title + Description */}
          <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-6 space-y-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-750 pb-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <FileText size={18} className="text-gold" />
                4. Task Specifications
              </h2>
            </div>

            {/* Category only applies to a student task — a mentor task's
                shape is fully decided by the Task Type toggle in Card 1
                (Checklist/Questions/Both), not this picker. */}
            {form.targetRole === 'student' && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                  <Target size={15} className="text-gold" />
                  Category *
                </label>
                <Select
                  value={form.category}
                  onChange={v => setForm({ ...form, category: v as ApiTaskCategory })}
                  options={TASK_CATEGORY_OPTIONS}
                  className="w-full"
                />
                <p className="text-[11px] text-gray-500 mt-1.5">
                  {form.category === 'document_submission'
                    ? 'Student submits a file via the Submissions tab.'
                    : form.category === 'link_submission'
                    ? 'Student submits a link via the Submissions tab.'
                    : 'Student writes a short text response via the Submissions tab — no file or link needed.'}
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Goal / Task Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="e.g., Set up Database Schema & API Contracts"
                className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors placeholder-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Detailed Instructions & Notes</label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Describe expectations, required deliverables, evaluation guidelines, or reference documentation..."
                rows={5}
                className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors resize-none placeholder-gray-500 leading-relaxed"
              />
            </div>
          </div>

          {/* Card 5: Date */}
          <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-6 space-y-5 shadow-sm">
            <h2 className="text-base font-semibold text-white flex items-center gap-2 border-b border-zinc-750 pb-4">
              <Calendar size={18} className="text-gold" />
              5. Date
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Target Week
                </label>
                <Select
                  value={form.week_number}
                  onChange={v => setForm({ ...form, week_number: v as string })}
                  className="w-full text-sm"
                  options={WEEKS.map(w => ({ value: String(w), label: `Week ${w}` }))}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Start Date *
                </label>
                <input
                  type="date"
                  style={{ colorScheme: 'dark' }}
                  value={form.start_date}
                  onChange={e => {
                    const newStart = e.target.value;
                    let newDue = form.due_date;
                    if (newStart) {
                      const [y, m, d] = newStart.split('-').map(Number);
                      if (y && m && d) {
                        const dueObj = new Date(Date.UTC(y, m - 1, d + 7));
                        newDue = dueObj.toISOString().split('T')[0];
                      }
                    } else {
                      newDue = '';
                    }
                    setForm(prev => ({ ...prev, start_date: newStart, due_date: newDue }));
                  }}
                  className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold transition-colors cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Due Date *
                </label>
                <input
                  type="date"
                  style={{ colorScheme: 'dark' }}
                  value={form.due_date}
                  onChange={e => setForm(prev => ({ ...prev, due_date: e.target.value }))}
                  className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold transition-colors cursor-pointer"
                />
                <p className="text-[11px] text-gray-500 mt-1.5 flex items-center gap-1">
                  <Clock size={12} />
                  Calculated automatically (+7 days) when start date is selected
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Right Sidebar Column: Summary only — every actual field lives in
            the ordered flow on the left. */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-6 space-y-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2 border-b border-zinc-750 pb-3">
              <Sparkles size={16} className="text-gold" />
              Assignment Summary
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center py-1.5 border-b border-zinc-800">
                <span className="text-gray-400">Target Role</span>
                <span className="font-semibold text-white capitalize">{form.targetRole}s</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-zinc-800">
                <span className="text-gray-400">Tracks</span>
                <span className="font-semibold text-gold text-right">
                  {selectedTracks.length > 0 ? selectedTracks.map(s => trackNameBySlug.get(s) ?? s).join(', ') : 'None selected'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-zinc-800">
                <span className="text-gray-400">Assignees Selected</span>
                <span className="font-semibold text-gold">
                  {form.targetRole === 'student' ? selectedAssignees.size : form.assigned_to.length}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-zinc-800">
                <span className="text-gray-400">Target Week</span>
                <span className="font-semibold text-white">Week {form.week_number}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-zinc-800">
                <span className="text-gray-400">Start Date</span>
                <span className="font-semibold text-white">{form.start_date || 'Not set'}</span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-gray-400">Due Date</span>
                <span className="font-semibold text-white">{form.due_date || 'Not set'}</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Bottom action bar — fixed, doesn't scroll with the form content above */}
      <div className="shrink-0 flex items-center justify-end gap-3 border-t border-zinc-750/60 pt-4">
        <Button
          variant="ghost"
          onClick={() => navigate('/admin/dashboard?tab=tasks')}
          className="px-4 py-2 text-sm text-gray-400 hover:text-white"
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors flex items-center gap-2 shadow-lg shadow-gold/10"
        >
          <Send size={16} />
          {saving ? 'Creating...' : 'Create Goal & Task'}
        </Button>
      </div>
    </div>
  );
}
