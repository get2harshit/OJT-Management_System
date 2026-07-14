import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Target } from 'lucide-react';
import Select from '../../components/Select';
import Button from '../../components/Button';
import { TRACKS } from '../../lib/constants';

import { apiCreateTask } from '../../lib/api/tasks';
import { apiListMentors } from '../../lib/api/mentors';
import { apiListStudents } from '../../lib/api/students';
import type { ApiMentor, ApiStudent } from '../../lib/types';
import { useToast } from '../../toast';

const WEEKS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function CreateTaskPage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const [mentors, setMentors] = useState<ApiMentor[]>([]);
  const [students, setStudents] = useState<ApiStudent[]>([]);
  
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    due_date: '',
    targetRole: 'student' as 'student' | 'mentor',
    assigned_to: [] as string[],
    week_number: '1',
    sub_tasks_raw: '',
  });

  useEffect(() => {
    Promise.all([apiListMentors(), apiListStudents()])
      .then(([mentorsRes, studentsRes]) => {
        setMentors(mentorsRes || []);
        setStudents(studentsRes || []);
      })
      .catch(console.error);
  }, []);

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
    const subTasks = form.sub_tasks_raw
      ? form.sub_tasks_raw.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    try {
      await apiCreateTask({
        title: form.title,
        description: form.description || undefined,
        targetRole: form.targetRole,
        assignees: form.assigned_to.length > 0 ? form.assigned_to : undefined,
        deadline: form.due_date ? new Date(form.due_date).toISOString() : undefined,
        week: `Week ${form.week_number}`,
        track: form.targetRole === 'student' && selectedTracks.length > 0 ? selectedTracks.join(', ') : undefined,
        subtasks: subTasks,
      });
      showSuccess('Task created successfully');
      navigate('/admin/dashboard?tab=tasks');
    } catch (err) {
      showError('Failed to create task');
      console.error(err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/admin/dashboard?tab=tasks')} className="p-2 hover:bg-zinc-800">
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-white">Create New Task / Goal</h1>
          <p className="text-gray-400 text-sm mt-1">Configure and assign a new task to students or mentors</p>
        </div>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-6 md:p-8 space-y-10">
        {/* STEP 1: TARGET ROLE */}
        <div>
          <label className="block text-base text-gray-300 mb-4 font-medium">1. Select Target Role</label>
          <div className="flex gap-4">
            <Button
              variant={form.targetRole === 'student' ? 'blue' : 'secondary'}
              onClick={() => setForm({ ...form, targetRole: 'student', assigned_to: [] })}
              className="flex-1 py-4 text-sm font-semibold"
            >
              Assign to Students
            </Button>
            <Button
              variant={form.targetRole === 'mentor' ? 'purple' : 'secondary'}
              onClick={() => setForm({ ...form, targetRole: 'mentor', assigned_to: [] })}
              className="flex-1 py-4 text-sm font-semibold"
            >
              Assign to Mentors
            </Button>
          </div>
        </div>

        <hr className="border-zinc-800" />

        {/* STEP 2: ASSIGNMENT FILTERS & SELECTION */}
        <div>
          <label className="block text-base text-gray-300 mb-4 font-medium">2. Select Assignees</label>
          <div className="space-y-6">
            {form.targetRole === 'student' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-zinc-900 border border-zinc-800 p-5 rounded-lg">
                <div>
                  <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider font-semibold">Batch</label>
                  <Select
                    isMulti
                    value={selectedBatches}
                    onChange={v => {
                      setSelectedBatches(v as string[]);
                      setForm(prev => ({ ...prev, assigned_to: [] }));
                    }}
                    className="w-full"
                    placeholder="All Batches"
                    options={uniqueBatches.map(b => ({ value: b, label: b }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider font-semibold">Track</label>
                  <Select
                    isMulti
                    value={selectedTracks}
                    onChange={v => {
                      setSelectedTracks(v as string[]);
                      setForm(prev => ({ ...prev, assigned_to: [] }));
                    }}
                    className="w-full"
                    placeholder="All Tracks"
                    options={TRACKS.map(t => ({ value: t, label: t }))}
                  />
                </div>
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm text-gray-400">Choose {form.targetRole === 'student' ? 'Students' : 'Mentors'}</label>
                <button
                  type="button"
                  onClick={() => {
                    if (form.assigned_to.length === assignableList.length) {
                      setForm({ ...form, assigned_to: [] });
                    } else {
                      setForm({ ...form, assigned_to: assignableList.map(a => a.id) });
                    }
                  }}
                  className="text-sm text-gold hover:underline font-medium"
                >
                  {form.assigned_to.length === assignableList.length && assignableList.length > 0 ? 'Clear All' : 'Select All'}
                </button>
              </div>
              <Select
                isMulti
                isSearchable
                value={form.assigned_to}
                onChange={v => setForm({ ...form, assigned_to: v as string[] })}
                className="w-full shadow-lg"
                placeholder={`Search and select ${form.targetRole}(s)...`}
                options={assignableList.map(a => ({ value: a.id, label: a.label }))}
              />
            </div>
          </div>
        </div>

        <hr className="border-zinc-800" />

        {/* STEP 3: TASK DETAILS */}
        <div>
          <label className="block text-base text-gray-300 mb-4 font-medium">3. Task Details</label>
          <div className="space-y-6">
            <div>
              <label className="block text-sm text-gray-400 mb-2 flex items-center gap-2">
                <Calendar size={14} className="text-gold" />
                Target Week
              </label>
              <Select
                value={form.week_number}
                onChange={v => setForm({ ...form, week_number: v as string })}
                className="w-full sm:w-1/2"
                options={WEEKS.map(w => ({ value: String(w), label: `Week ${w}` }))}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Goal / Task Title</label>
              <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g., Set up Database Architecture" className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors" />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Detailed Description</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Describe expectations or provide reference links..." rows={4} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors resize-none" />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2 flex items-center gap-2">
                <Target size={14} className="text-gold" />
                Sub-tasks (Comma separated)
              </label>
              <input
                type="text"
                value={form.sub_tasks_raw}
                onChange={e => setForm({ ...form, sub_tasks_raw: e.target.value })}
                placeholder="e.g. Design DB Schema, Create migrations, Host locally"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Due Date</label>
              <input 
                type="date" 
                style={{ colorScheme: 'dark' }}
                value={form.due_date} 
                onChange={e => setForm({ ...form, due_date: e.target.value })} 
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors cursor-pointer" 
              />
            </div>
          </div>
        </div>

        <div className="pt-6">
          <Button onClick={handleSave} fullWidth size="lg" className="py-4 text-base font-bold shadow-lg shadow-gold/10">
            Create Goal & Task
          </Button>
        </div>
      </div>
    </div>
  );
}
