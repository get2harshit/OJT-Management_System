import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Users,
  UserCheck,
  Layers,
  Send,
  FileText,
  ClipboardList,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import Select from '../../components/Select';
import Button from '../../components/Button';
import AssigneePickerTable, { dedupeStudentRows } from '../../components/AssigneePickerTable';
import type { AssigneePickerStudentRow, AssigneePickerTeamRow } from '../../components/AssigneePickerTable';
import WeeklyReportGrid, { WeeklyReportSummaryStrip } from '../../components/WeeklyReportGrid';
import { useTracks } from '../../hooks/useTracks';
import { apiCreateTask } from '../../lib/api/tasks';
import type { ApiTaskCategory, ApiWeeklyReportSummary, ApiWeeklyReportTeam } from '../../lib/api/tasks';
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

const MENTOR_TYPE_FILTER_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'internal', label: 'Internal' },
  { value: 'external', label: 'Industry' },
];

// What the admin actually sends, shown while they're deciding whether to
// send it — one filled-in example row, rendered through the exact same
// WeeklyReportGrid component a mentor and the admin's own "View Weekly
// Reports" page use. Reusing the real component rather than redrawing a
// mock of it means this preview can never drift out of sync with the real
// grid — if a column is added or reordered there, it changes here too.
const SAMPLE_WEEKLY_REPORT_TEAMS: ApiWeeklyReportTeam[] = [
  {
    teamId: 'preview-team',
    teamName: 'Team Alpha',
    trackName: 'Gen AI',
    projectTitle: 'Customer Support Chatbot',
    projectStatus: 'on_track',
    teamHealth: 'positive',
    weeklyFeedback: 'Good progress on the retrieval pipeline this week — on track for the demo.',
    // One list for the whole team — everyone on it works the same project.
    techStack: ['React', 'Node.js', 'FastAPI'],
    students: [
      {
        studentId: 'preview-student-1',
        name: 'Aisha Khan',
        registrationNumber: '2025A1234',
        batch: '2025 A',
        techSkill: 4,
        communication: 4,
        overallPerformance: 4,
      },
      {
        studentId: 'preview-student-2',
        name: 'Rohan Mehta',
        registrationNumber: '2025A5678',
        batch: '2025 A',
        techSkill: 3,
        communication: 5,
        overallPerformance: 4,
      },
    ],
  },
];

/**
 * The strip that sits above the grid — the same summary a mentor and the
 * admin's own aggregate view see, built here from the same illustrative
 * numbers rather than a live query (no task exists yet to compute it from).
 * Its week columns track the Target Week the admin has picked below, so
 * picking Week 3 previews W1–W3 exactly like the real strip would once
 * three weeks of reports existed.
 */
function buildSampleWeeklySummary(uptoWeek: number): ApiWeeklyReportSummary {
  const weeks = Array.from({ length: Math.max(uptoWeek, 1) }, (_, i) => {
    const week = i + 1;
    // Every earlier week reads as fully on track; only the current one
    // shows a shortfall — the one case worth illustrating, since a full
    // week never needs the admin's attention.
    const onTrack = week === uptoWeek ? 8 : 10;
    return { week, label: `W${week}`, onTrack, total: 10 };
  });
  return {
    teamCount: 10,
    studentCount: 14,
    weeks,
    noShowStudents: [
      { studentId: 'preview-noshow-1', name: 'Karan Bhatt', batch: '2025 A' },
      { studentId: 'preview-noshow-2', name: 'Meera Iyer', batch: '2025 B' },
    ],
  };
}

export default function CreateTaskPage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const { tracks, options: trackOptions } = useTracks();
  const mentorTrackFilterOptions = useMemo(() => [{ value: '', label: 'All tracks' }, ...trackOptions], [trackOptions]);
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
  // Narrows the mentor picker below — Internal/Industry and a track, both
  // applied server-side (apiListMentors). Independent of selectedTracks:
  // a mentor task no longer carries an admin-picked track at all (see
  // mentorTaskTracks below), these two only decide who shows up to pick from.
  const [mentorTypeFilter, setMentorTypeFilter] = useState<'all' | 'internal' | 'external'>('all');
  const [mentorTrackFilter, setMentorTrackFilter] = useState('');
  // Collapsed by default — most admins sending a routine weekly report
  // already know the shape; this is for the first time, or a refresher.
  const [showTemplatePreview, setShowTemplatePreview] = useState(false);

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

  const sampleWeeklySummary = useMemo(() => buildSampleWeeklySummary(Number(form.week_number) || 1), [form.week_number]);

  const loadCohorts = useCallback(() => {
    return apiListCohorts().then(setCohorts).catch(console.error);
  }, []);

  useEffect(() => {
    loadCohorts();
  }, [loadCohorts]);

  // Mentor pool for the picker, server-filtered by type/track — refetched
  // whenever either changes rather than fetched once and sliced client-side
  // (this codebase's standing rule: filters are always backend-side, never
  // a client-side narrowing of an already-fetched full list). Only runs in
  // mentor mode; the student flow never reads `mentors` at all.
  const loadMentors = useCallback(() => {
    if (form.targetRole !== 'mentor') return Promise.resolve();
    return apiListMentors(mentorTypeFilter === 'all' ? undefined : mentorTypeFilter, mentorTrackFilter || undefined)
      .then(res => setMentors(res || []))
      .catch(() => setMentors([]));
  }, [form.targetRole, mentorTypeFilter, mentorTrackFilter]);

  useEffect(() => {
    loadMentors();
  }, [loadMentors]);

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
      () => Promise.all([loadCohorts(), loadMentors(), loadStudentCandidates(), loadTeamCandidates()]),
      [loadCohorts, loadMentors, loadStudentCandidates, loadTeamCandidates]
    )
  );

  const mentorAssignableList = mentors.map(m => ({ id: m.id, label: m.fullName || m.email || m.id }));

  // What the sidebar column used to say, as one line. Every part is dropped
  // until it has a value, so an empty form reads as a prompt rather than a
  // row of "Not set".
  // The task still carries a track set (used by the Tasks list filter and
  // its Tech Stack/Track column) — but for a mentor task nobody picks it by
  // hand any more. It's the union of the selected mentors' own declared
  // tracks, so the task is discoverable under whichever track(s) actually
  // sent it. mentors here is already the type/track-filtered pool, but
  // form.assigned_to can only ever hold ids drawn from whatever that pool
  // was at selection time, so this stays correct even after the filters
  // change again.
  const mentorTaskTracks = useMemo(() => {
    if (form.targetRole !== 'mentor') return [];
    const selected = new Set(form.assigned_to);
    return Array.from(new Set(mentors.filter(m => selected.has(m.id)).flatMap(m => m.tracks ?? [])));
  }, [form.targetRole, form.assigned_to, mentors]);

  const summaryLine = useMemo(() => {
    const assigneeCount = form.targetRole === 'student' ? selectedAssignees.size : form.assigned_to.length;
    const secondPart = form.targetRole === 'student'
      ? (selectedTracks.length > 0 ? selectedTracks.map(slug => trackNameBySlug.get(slug) ?? slug).join(', ') : 'no track yet')
      : (mentorTaskTracks.length > 0 ? mentorTaskTracks.map(slug => trackNameBySlug.get(slug) ?? slug).join(', ') : 'pick mentors to set the track');
    const parts = [
      `To ${form.targetRole === 'student' ? 'students' : 'mentors'}`,
      secondPart,
      assigneeCount > 0 ? `${assigneeCount} selected` : 'nobody selected yet',
      `Week ${form.week_number}`,
    ];
    if (form.start_date && form.due_date) parts.push(`${form.start_date} → ${form.due_date}`);
    return parts.join('  ·  ');
  }, [form.targetRole, form.assigned_to.length, form.week_number, form.start_date, form.due_date, selectedAssignees.size, selectedTracks, mentorTaskTracks, trackNameBySlug]);

  const handleSave = async () => {
    if (!form.title) {
      showError('Task title is required');
      return;
    }
    if (form.targetRole === 'student' && selectedTracks.length === 0) {
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
    if (form.targetRole === 'mentor' && mentorTaskTracks.length === 0) {
      showError('None of the selected mentors have a track set — pick mentors who have one, or set it on their profile first.');
      return;
    }

    setSaving(true);
    try {
      await apiCreateTask({
        title: form.title,
        description: form.description || undefined,
        target_role: form.targetRole,
        // A mentor task is always the weekly report — never a document or
        // link submission — so category is fixed rather than exposed as a
        // picker. It is also what makes the mentor's page render the grid.
        category: form.targetRole === 'mentor' ? 'weekly_report' : form.category,
        assign_mode: form.targetRole === 'student' ? form.assignMode : 'individual',
        assignees: form.targetRole === 'mentor'
          ? form.assigned_to
          : form.assignMode === 'individual' ? Array.from(selectedAssignees) : undefined,
        teamIds: form.targetRole === 'student' && form.assignMode === 'team' ? Array.from(selectedAssignees) : undefined,
        start_date: new Date(form.start_date).toISOString(),
        deadline: new Date(form.due_date).toISOString(),
        week: `Week ${form.week_number}`,
        tracks: form.targetRole === 'mentor' ? mentorTaskTracks : selectedTracks,
        cohort_id: activeCohort.id,
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

      {/* One card, not five.
          Creating a task is a single sequence — pick who, pick where, pick
          them, describe it, date it — and the old layout broke that sequence
          across five separate panels plus a summary column, so the admin's
          eye had to travel to six places to check one form. Sections are
          divided by a rule inside one surface instead, and the summary that
          used to sit in its own column is now one line above the button that
          uses it. */}
      <div className="flex-1 min-h-0 overflow-y-auto pb-6">
        <div className="w-full max-w-[1600px] bg-zinc-850 border border-zinc-750 rounded-xl shadow-sm divide-y divide-zinc-800">

          {/* Who it goes to. A compact segmented control rather than two
              large cards — it is a two-way choice, not a decision that needs
              a third of the screen, and everything below reshapes from it. */}
          <div className="p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Assign to</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {form.targetRole === 'student'
                  ? 'Students, picked by track and batch below.'
                  : 'Mentors, who each get a weekly report grid of their own teams.'}
              </p>
            </div>
            <div className="inline-flex rounded-lg border border-zinc-750 bg-zinc-900 p-1 shrink-0">
              {([
                { value: 'student' as const, label: 'Students', Icon: Users, tone: 'bg-blue-500/15 text-blue-300 border-blue-500/40' },
                { value: 'mentor' as const, label: 'Mentors', Icon: UserCheck, tone: 'bg-purple-500/15 text-purple-300 border-purple-500/40' },
              ]).map(({ value, label, Icon, tone }) => {
                const active = form.targetRole === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setForm(prev => ({
                        ...prev,
                        targetRole: value,
                        assigned_to: [],
                        ...(value === 'mentor' ? { assignMode: 'individual' as const } : {}),
                      }));
                      setSelectedAssignees(new Set());
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                      active ? tone : 'border-transparent text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {form.targetRole === 'mentor' && (
            <div className="px-5 py-4 bg-purple-500/[0.04] space-y-3">
              <div className="flex items-start gap-2.5">
                <ClipboardList size={16} className="text-purple-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    <span className="text-white font-semibold">Weekly Report.</span> Each mentor fills a grid of
                    their own teams — project status, team health and written feedback per team, plus tech skill,
                    communication and overall OJT performance (0&ndash;5) for every student. Pick the week below.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowTemplatePreview(v => !v)}
                    className="flex items-center gap-1 text-[11px] font-semibold text-purple-300 hover:text-purple-200 transition-colors mt-2"
                  >
                    {showTemplatePreview ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {showTemplatePreview ? 'Hide' : 'Preview'} what the mentor will see
                  </button>
                </div>
              </div>

              {showTemplatePreview && (
                <div className="space-y-2.5">
                  <WeeklyReportSummaryStrip summary={sampleWeeklySummary} />
                  <WeeklyReportGrid teams={SAMPLE_WEEKLY_REPORT_TEAMS} readOnly />
                  <p className="text-[10px] text-gray-500">
                    Example only — real numbers and one row per team like this appear once mentors start reporting.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Track — student mode only. A mentor task has nothing to scope by
              track any more: the report always covers all of a mentor's
              teams regardless of track, and who gets picked is narrowed by
              the type/track filters sitting on the Mentors picker below
              instead of a track chosen for the task itself. */}
          {form.targetRole === 'student' && (
            <div className="p-5 space-y-2">
              <SectionLabel icon={<Layers size={13} />} text="Track" required />
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
                A task can span more than one track — the list below fills with every matching track&rsquo;s students or teams.
              </p>
            </div>
          )}

          {/* Who */}
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <SectionLabel
                icon={<Users size={13} />}
                text={form.targetRole === 'student' ? 'Team / Students' : 'Mentors'}
                required
              />
              <span className="text-[11px] text-gray-500">
                {form.targetRole === 'student' ? selectedAssignees.size : form.assigned_to.length} selected
              </span>
            </div>

            {form.targetRole === 'student' ? (
              selectedTracks.length === 0 ? (
                <p className="text-sm text-gray-500 py-8 text-center border border-dashed border-zinc-800 rounded-lg">
                  Pick a track above to see who can be assigned.
                </p>
              ) : (
                <>
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
                  <p className="text-[11px] text-gray-500">
                    Only students whose team&rsquo;s project allocation has been published are shown here.
                  </p>
                </>
              )
            ) : (
              <>
                {/* Narrows the pool the search box below draws from — both
                    filters are applied server-side (apiListMentors), never
                    a client-side slice of an already-fetched full list. */}
                <div className="flex items-center gap-2">
                  <Select
                    variant="filter"
                    value={mentorTypeFilter}
                    onChange={v => {
                      setMentorTypeFilter(v as 'all' | 'internal' | 'external');
                      setForm(prev => ({ ...prev, assigned_to: [] }));
                    }}
                    className="w-36"
                    options={MENTOR_TYPE_FILTER_OPTIONS}
                  />
                  <Select
                    variant="filter"
                    value={mentorTrackFilter}
                    onChange={v => {
                      setMentorTrackFilter(v as string);
                      setForm(prev => ({ ...prev, assigned_to: [] }));
                    }}
                    className="w-48"
                    options={mentorTrackFilterOptions}
                  />
                </div>
                <Select
                  isMulti
                  isSearchable
                  value={form.assigned_to}
                  onChange={v => setForm({ ...form, assigned_to: v as string[] })}
                  className="w-full"
                  placeholder="Search and select mentor(s)..."
                  options={mentorAssignableList.map(a => ({ value: a.id, label: a.label }))}
                />
                <p className="text-[11px] text-gray-500">
                  {mentorTaskTracks.length > 0
                    ? `Filed under: ${mentorTaskTracks.map(slug => trackNameBySlug.get(slug) ?? slug).join(', ')} — from the selected mentors' own tracks.`
                    : 'The task is filed under whichever tracks the selected mentors have — pick at least one mentor with a track set.'}
                </p>
              </>
            )}
          </div>

          {/* What it is */}
          <div className="p-5 space-y-4">
            <SectionLabel icon={<FileText size={13} />} text="Details" />

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Goal / Task Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="e.g., Set up Database Schema & API Contracts"
                className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold transition-colors placeholder-gray-500"
              />
            </div>

            {/* Category is a student-only idea — a mentor task's shape is
                already decided by the Assign to toggle above. */}
            {form.targetRole === 'student' && (
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Category *</label>
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
              <label className="block text-xs text-gray-400 mb-1.5">Detailed Instructions &amp; Notes</label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Describe expectations, required deliverables, evaluation guidelines, or reference documentation..."
                rows={4}
                className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold transition-colors resize-none placeholder-gray-500 leading-relaxed"
              />
            </div>
          </div>

          {/* When */}
          <div className="p-5 space-y-3">
            <SectionLabel icon={<Calendar size={13} />} text="Schedule" required />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Target Week</label>
                <Select
                  value={form.week_number}
                  onChange={v => setForm({ ...form, week_number: v as string })}
                  className="w-full text-sm"
                  options={WEEKS.map(w => ({ value: String(w), label: `Week ${w}` }))}
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Start Date *</label>
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
                  className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold transition-colors cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Due Date *</label>
                <input
                  type="date"
                  style={{ colorScheme: 'dark' }}
                  value={form.due_date}
                  onChange={e => setForm(prev => ({ ...prev, due_date: e.target.value }))}
                  className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold transition-colors cursor-pointer"
                />
                <p className="text-[11px] text-gray-500 mt-1">Auto-set to +7 days from the start date.</p>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom action bar — the old summary column, reduced to the one line
          that actually matters, next to the button it describes. */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-750/60 pt-4">
        <p className="text-[11px] text-gray-500 min-w-0">
          {summaryLine}
        </p>
        <div className="flex items-center gap-3 shrink-0">
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
    </div>
  );
}

/** One section's heading inside the single form card. */
function SectionLabel({ icon, text, required }: { icon: React.ReactNode; text: string; required?: boolean }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
      <span className="text-gold">{icon}</span>
      {text}
      {required && <span className="text-gold">*</span>}
    </p>
  );
}
