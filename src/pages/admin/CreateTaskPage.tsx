import { useState, useEffect } from 'react';
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
import type { ApiTaskType } from '../../lib/api/tasks';
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

export default function CreateTaskPage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [mentors, setMentors] = useState<ApiMentor[]>([]);
  const [students, setStudents] = useState<ApiStudent[]>([]);
  const [saving, setSaving] = useState(false);

  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    due_date: '',
    targetRole: 'student' as 'student' | 'mentor',
    assigned_to: [] as string[],
    week_number: '1',
    taskType: 'others' as ApiTaskType,
    sub_tasks: [] as string[],
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

  // Auto-calculate due date when week changes
  useEffect(() => {
    if (!form.week_number || cohorts.length === 0) return;
    const activeCohort = cohorts.find(c => c.is_active || (c as { activeStatus?: boolean }).activeStatus) || cohorts[0];
      
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
  }, [form.week_number, cohorts]);

  const uniqueBatches = Array.from(new Set(students.map(s => s.batch).filter(Boolean))) as string[];

  const assignableList = form.targetRole === 'student'
    ? students
        .filter(s => (selectedBatches.length > 0 ? selectedBatches.includes(s.batch!) : true))
        .filter(s => (selectedTracks.length > 0 ? selectedTracks.includes(s.track!) : true))
        .map(s => ({ id: s.id, label: `${s.fullName || s.email} (${s.rollNumber || 'N/A'})` }))
    : mentors.map(m => ({ id: m.id, label: m.fullName || m.email || m.id }));

  const handleSave = async () => {
    if (!form.title) {
      showError('Task title is required');
      return;
    }

    setSaving(true);
    try {
      await apiCreateTask({
        title: form.title,
        description: form.description || undefined,
        targetRole: form.targetRole,
        taskType: (form.sub_tasks.length > 0 && ['prd', 'db_schema', 'hld', 'lld', 'api_contract', 'others'].includes(form.sub_tasks[0])) ? form.sub_tasks[0] as ApiTaskType : 'others',
        subtasks: form.sub_tasks,
        assignees: form.assigned_to.length > 0 ? form.assigned_to : undefined,
        deadline: form.due_date ? new Date(form.due_date).toISOString() : undefined,
        week: `Week ${form.week_number}`,
        track: form.targetRole === 'student' && selectedTracks.length > 0 ? selectedTracks.join(', ') : undefined,
      });
      showSuccess('Task created successfully');
      navigate('/admin/dashboard?tab=tasks');
    } catch (err) {
      showError('Failed to create task');
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
                onClick={() => setForm({ ...form, targetRole: 'mentor', assigned_to: [] })}
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

            {/* Filter Inset Box */}
            {form.targetRole === 'student' && (
              <div className="bg-zinc-900/80 border border-zinc-750 rounded-xl p-4 space-y-3">
                <p className="text-xs text-gray-400 uppercase font-semibold tracking-wider flex items-center gap-1.5">
                  <Layers size={14} className="text-gold" />
                  Filter Assignable Pool
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5 font-medium">Filter by Track</label>
                    <Select
                      isMulti
                      value={selectedTracks}
                      onChange={v => {
                        setSelectedTracks(v as string[]);
                        setForm(prev => ({ ...prev, assigned_to: [] }));
                      }}
                      className="w-full text-xs"
                      placeholder="All Tracks"
                      options={TRACKS.map(t => ({ value: t, label: t }))}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Assignee Multi-Select */}
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
            </div>
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

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                <Target size={15} className="text-gold" />
                Sub-tasks / Deliverable Types
              </label>
              <Select
                isMulti
                isCreatable
                value={form.sub_tasks}
                onChange={v => setForm({ ...form, sub_tasks: v as string[] })}
                options={TASK_TYPE_OPTIONS}
                className="w-full"
                placeholder="Select or type deliverable tags (e.g. PRD, DB Schema...)"
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
                Due Date
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
              <div className="flex justify-between items-center py-1.5">
                <span className="text-gray-400">Due Date</span>
                <span className="font-semibold text-white">{form.due_date || 'Not set'}</span>
              </div>
            </div>

            {form.sub_tasks.length > 0 && (
              <div className="pt-2 border-t border-zinc-800">
                <p className="text-[11px] text-gray-400 mb-1.5 font-medium">Sub-task Deliverables:</p>
                <div className="flex flex-wrap gap-1.5">
                  {form.sub_tasks.map(st => (
                    <span key={st} className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gold/15 text-gold border border-gold/30">
                      {st}
                    </span>
                  ))}
                </div>
              </div>
            )}
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
