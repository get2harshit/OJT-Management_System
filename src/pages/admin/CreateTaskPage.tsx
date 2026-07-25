import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Target,
  Users,
  UserCheck,
  CheckCircle2,
  Sparkles,
  Layers,
  Clock,
  Send,
  FileText
} from 'lucide-react';
import Select from '../../components/Select';
import Button from '../../components/Button';
import { TRACKS } from '../../lib/constants';
import { apiCreateTask } from '../../lib/api/tasks';
import type { ApiTaskType, ApiTaskCategory } from '../../lib/api/tasks';
import { apiListMentors } from '../../lib/api/mentors';
import { apiListStudents } from '../../lib/api/students';
import type { ApiMentor, ApiStudent, Cohort } from '../../lib/types';
import { useToast } from '../../toast';
import { apiListCohorts } from '../../lib/api';

const WEEKS = Array.from({ length: 12 }, (_, i) => i + 1);

const TASK_TYPE_OPTIONS = [
  { value: 'prd', label: 'PRD' },
  { value: 'db_schema', label: 'DB Schema' },
  { value: 'hld', label: 'HLD' },
  { value: 'lld', label: 'LLD' },
  { value: 'api_contract', label: 'API Contract' },
  { value: 'others', label: 'Others' },
];

const TASK_CATEGORY_OPTIONS: { value: ApiTaskCategory; label: string }[] = [
  { value: 'document_submission', label: 'Document Submission' },
  { value: 'general', label: 'General (no submission)' },
  { value: 'link_submission', label: 'Link Submission' },
];

export default function CreateTaskPage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [mentors, setMentors] = useState<ApiMentor[]>([]);
  const [students, setStudents] = useState<ApiStudent[]>([]);
  const [saving, setSaving] = useState(false);

  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  // Single track only — the backend matches this against a single-value
  // Postgres enum (team.track / mentor.track / task assignment queries), so
  // a multi-select here would produce a comma-joined string that crashes
  // Prisma with "Invalid value for argument track" (a real bug hit in
  // testing: selecting all 5 tracks sent "Product Development, Application
  // Development, ..." as one string).
  const [selectedTrack, setSelectedTrack] = useState<string>('');
  const [form, setForm] = useState({
    title: '',
    description: '',
    start_date: '',
    due_date: '',
    targetRole: 'student' as 'student' | 'mentor',
    assignMode: 'individual' as 'individual' | 'team',
    assigned_to: [] as string[],
    week_number: '1',
    taskType: 'others' as ApiTaskType,
    category: 'document_submission' as ApiTaskCategory,
  });

  useEffect(() => {
    Promise.all([apiListMentors(), apiListStudents(), apiListCohorts()])
      .then(([mentorsRes, studentsRes, cohortsRes]) => {
        setMentors(mentorsRes || []);
        setStudents(studentsRes || []);
        setCohorts(cohortsRes || []);
      })
      .catch(console.error);
  }, []);

  // Every task is created under whichever cohort is currently active — the
  // form has no cohort picker of its own, it just targets "the" running
  // cohort, same assumption the due-date auto-calculation below already made.
  const activeCohort = useMemo(
    () => cohorts.find(c => c.is_active || (c as { activeStatus?: boolean }).activeStatus) || cohorts[0],
    [cohorts]
  );

  // Auto-calculate due date when week changes
  useEffect(() => {
    if (!form.week_number || cohorts.length === 0) return;

    if (activeCohort && activeCohort.startDate) {
      const start = new Date(activeCohort.startDate);
      const weekOffset = parseInt(form.week_number, 10);
      if (!isNaN(weekOffset)) {
        const due = new Date(start.getTime() + (weekOffset * 7 * 24 * 60 * 60 * 1000));
        setForm(prev => ({
          ...prev,
          due_date: due.toISOString().split('T')[0]
        }));
      }
    }
  }, [form.week_number, cohorts, activeCohort]);

  const uniqueBatches = Array.from(new Set(students.map(s => s.batch).filter(Boolean))) as string[];

  // The backend silently drops any student whose team hasn't been published
  // yet from task assignment (they shouldn't get a task before they can even
  // see their own allocation) — filtered out here too so the picker doesn't
  // let admin select someone who'd just be dropped on save with no feedback.
  // Checked against the sticky allocationPublishedAt rather than the live
  // allocationRunStatus enum — that enum legitimately drops back to
  // 'draft'/'review' whenever a later batch of teams gets run in the same
  // cohort, which must not re-hide an already-published student here.
  const publishedCohortIds = new Set(
    cohorts.filter(c => !!c.allocationPublishedAt).map(c => c.id)
  );
  const unpublishedStudentCount = students.filter(
    s => !s.activeCohortId || !publishedCohortIds.has(s.activeCohortId)
  ).length;

  const assignableList = form.targetRole === 'student'
    ? students
        .filter(s => !!s.activeCohortId && publishedCohortIds.has(s.activeCohortId))
        .filter(s => (selectedBatches.length > 0 ? selectedBatches.includes(s.batch!) : true))
        .filter(s => (selectedTrack ? s.track === selectedTrack : true))
        .map(s => ({ id: s.id, label: `${s.fullName || s.email} (${s.rollNumber || 'N/A'})` }))
    : mentors.map(m => ({ id: m.id, label: m.fullName || m.email || m.id }));

  const handleSave = async () => {
    if (!form.title) {
      showError('Task title is required');
      return;
    }
    if (!selectedTrack) {
      showError('Select a track');
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

    setSaving(true);
    try {
      await apiCreateTask({
        title: form.title,
        description: form.description || undefined,
        target_role: form.targetRole,
        task_type: form.taskType,
        category: form.category,
        assign_mode: form.targetRole === 'student' ? form.assignMode : 'individual',
        // Team-submission mode assigns whole teams matching the track/batch
        // filters — no individual hand-picking, so assignees is never sent.
        assignees: form.assignMode === 'individual' && form.assigned_to.length > 0 ? form.assigned_to : undefined,
        start_date: new Date(form.start_date).toISOString(),
        deadline: new Date(form.due_date).toISOString(),
        week: `Week ${form.week_number}`,
        track: selectedTrack,
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
    <div className="w-full space-y-6 pb-20">
      {/* Top Page Bar */}
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-zinc-750/60 pb-5">
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

        <div className="flex items-center gap-3">
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

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Columns: Role & Assignees + Task Details */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Card 1: Target Role & Assignees */}
          <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-6 space-y-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-750 pb-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Users size={18} className="text-gold" />
                1. Target Role & Assignees
              </h2>
              <span className="text-xs text-gray-500">Step 1 of 2</span>
            </div>

            {/* Role Selection Toggle */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setForm({ ...form, targetRole: 'student', assigned_to: [] })}
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
                onClick={() => setForm({ ...form, targetRole: 'mentor', assignMode: 'individual', assigned_to: [] })}
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

            {/* Submission Mode Toggle — team mode assigns whole teams
                matching the track/batch filters below (one member's
                submission completes it for the team); only meaningful for
                students, mentors have no team concept. */}
            {form.targetRole === 'student' && (
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">Submission Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, assignMode: 'individual', assigned_to: [] })}
                    className={`px-4 py-2.5 rounded-lg border text-sm font-semibold transition-colors ${
                      form.assignMode === 'individual'
                        ? 'bg-gold/10 border-gold text-gold'
                        : 'bg-zinc-900 border-zinc-750 text-gray-400 hover:border-zinc-600'
                    }`}
                  >
                    Individual Submission
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, assignMode: 'team', assigned_to: [] })}
                    className={`px-4 py-2.5 rounded-lg border text-sm font-semibold transition-colors ${
                      form.assignMode === 'team'
                        ? 'bg-gold/10 border-gold text-gold'
                        : 'bg-zinc-900 border-zinc-750 text-gray-400 hover:border-zinc-600'
                    }`}
                  >
                    Team Submission
                  </button>
                </div>
              </div>
            )}

            {/* Filter Inset Box — Track is always shown now since the
                backend requires `track` on every task regardless of
                target_role; Batch filtering only makes sense for students. */}
            <div className="bg-zinc-900/80 border border-zinc-750 rounded-xl p-4 space-y-3">
              <p className="text-xs text-gray-400 uppercase font-semibold tracking-wider flex items-center gap-1.5">
                <Layers size={14} className="text-gold" />
                Filter Assignable Pool
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {form.targetRole === 'student' && (
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5 font-medium">Filter by Batch</label>
                    <Select
                      isMulti
                      value={selectedBatches}
                      onChange={v => {
                        setSelectedBatches(v as string[]);
                        setForm(prev => ({ ...prev, assigned_to: [] }));
                      }}
                      className="w-full text-xs"
                      placeholder="All Batches"
                      options={uniqueBatches.map(b => ({ value: b, label: b }))}
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 font-medium">Track *</label>
                  <Select
                    value={selectedTrack}
                    onChange={v => {
                      setSelectedTrack(v as string);
                      setForm(prev => ({ ...prev, assigned_to: [] }));
                    }}
                    className="w-full text-xs"
                    placeholder="Select track..."
                    options={TRACKS.map(t => ({ value: t, label: t }))}
                  />
                </div>
              </div>
            </div>

            {/* Assignee Multi-Select — not applicable in team-submission
                mode, where teams are auto-matched by track/batch instead of
                hand-picked. */}
            {form.assignMode === 'team' ? (
              <div className="bg-zinc-900/80 border border-zinc-750 rounded-xl p-4">
                <p className="text-sm text-gray-300">
                  Every team matching the track{selectedBatches.length > 0 ? ' and batch' : ''} filter above will be assigned this task — one member submitting completes it for the whole team.
                </p>
              </div>
            ) : (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-300">
                    Select {form.targetRole === 'student' ? 'Students' : 'Mentors'} ({form.assigned_to.length} selected)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (form.assigned_to.length === assignableList.length) {
                        setForm({ ...form, assigned_to: [] });
                      } else {
                        setForm({ ...form, assigned_to: assignableList.map(a => a.id) });
                      }
                    }}
                    className="text-xs text-gold hover:underline font-semibold transition-colors"
                  >
                    {form.assigned_to.length === assignableList.length && assignableList.length > 0 ? 'Clear All' : 'Select All'}
                  </button>
                </div>
                <Select
                  isMulti
                  isSearchable
                  value={form.assigned_to}
                  onChange={v => setForm({ ...form, assigned_to: v as string[] })}
                  className="w-full"
                  placeholder={`Search and select ${form.targetRole}(s)...`}
                  options={assignableList.map(a => ({ value: a.id, label: a.label }))}
                />
                {form.targetRole === 'student' && unpublishedStudentCount > 0 && (
                  <p className="text-[11px] text-gray-500 mt-1.5">
                    {unpublishedStudentCount} student{unpublishedStudentCount !== 1 ? 's' : ''} hidden — their team's project allocation hasn't been published yet.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Card 2: Task Specifications */}
          <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-6 space-y-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-750 pb-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <FileText size={18} className="text-gold" />
                2. Task Specifications & Description
              </h2>
              <span className="text-xs text-gray-500">Step 2 of 2</span>
            </div>

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                  <Target size={15} className="text-gold" />
                  Deliverable Type *
                </label>
                <Select
                  value={form.taskType}
                  onChange={v => setForm({ ...form, taskType: v as ApiTaskType })}
                  options={TASK_TYPE_OPTIONS}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Category *</label>
                <Select
                  value={form.category}
                  onChange={v => setForm({ ...form, category: v as ApiTaskCategory })}
                  options={TASK_CATEGORY_OPTIONS}
                  className="w-full"
                />
                <p className="text-[11px] text-gray-500 mt-1.5">
                  {form.category === 'document_submission'
                    ? 'Student submits a file via the Submissions tab.'
                    : 'No file/link expected — reviewed directly from the Tasks tab.'}
                </p>
              </div>
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

        </div>

        {/* Right Sidebar Column: Timeline, Summary & Actions */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Card 3: Schedule & Timeline */}
          <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-6 space-y-5 shadow-sm">
            <h3 className="text-base font-semibold text-white flex items-center gap-2 border-b border-zinc-750 pb-3">
              <Calendar size={18} className="text-gold" />
              Schedule & Target Date
            </h3>

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
                onChange={e => setForm({ ...form, start_date: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold transition-colors cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Due Date *
              </label>
              <div className="relative">
                <input
                  type="date"
                  style={{ colorScheme: 'dark' }}
                  value={form.due_date}
                  onChange={e => setForm({ ...form, due_date: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold transition-colors cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-gray-500 mt-1.5 flex items-center gap-1">
                <Clock size={12} />
                Calculated automatically from active cohort timeline
              </p>
            </div>
          </div>

          {/* Card 4: Summary Card */}
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
                <span className="text-gray-400">Assignees Selected</span>
                <span className="font-semibold text-gold">
                  {form.assigned_to.length > 0 ? `${form.assigned_to.length} selected` : 'All matching pool'}
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

          {/* Card 5: Big Action Button */}
          <div className="space-y-3">
            <Button
              onClick={handleSave}
              disabled={saving}
              fullWidth
              size="lg"
              className="py-3.5 text-sm font-bold bg-gold text-black hover:bg-gold-hover transition-colors shadow-lg shadow-gold/10 flex items-center justify-center gap-2"
            >
              <CheckCircle2 size={18} />
              {saving ? 'Creating Goal...' : 'Create Goal & Task'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate('/admin/dashboard?tab=tasks')}
              fullWidth
              className="py-2.5 text-xs text-gray-400 hover:text-white"
            >
              Cancel & Return to Tasks
            </Button>
          </div>

        </div>

      </div>
    </div>
  );
}
