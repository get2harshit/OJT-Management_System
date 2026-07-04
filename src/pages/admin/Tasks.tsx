import { useState } from 'react';
import { Plus, Trash2, Calendar, Target, CheckSquare, Layers } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import type { Task, Profile, Student, TaskType } from '../../lib/types';
import { useMentors } from '../../hooks/useMentors';
import { useStudentProfiles } from '../../hooks/useStudentProfiles';
import { TRACKS } from '../../lib/constants';

interface Props {
  tasks: Task[];
  profiles: Profile[];
  students: Student[];
  addTask: (task: Omit<Task, 'id' | 'created_at'>) => void;
  deleteTask: (id: string) => void;
}

const WEEKS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function AdminTasks({ tasks, profiles, students, addTask, deleteTask }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    start_date: '',
    due_date: '',
    type: 'STUDENT_SPECIFIC' as TaskType,
    assigned_to: '',
    week_number: '1',
    is_viva: false,
    track: TRACKS[0],
    sub_tasks_raw: '',
  });

  const mentors = useMentors(profiles);
  const studentProfiles = useStudentProfiles(profiles);

  const assignableList = form.type === 'STUDENT_SPECIFIC'
    ? students.map(s => {
        const prof = studentProfiles.find(p => p.id === s.user_id);
        return { id: s.user_id, label: `${prof?.name ?? s.user_id} (${s.roll_number})` };
      })
    : mentors.map(m => ({ id: m.id, label: m.name }));

  const handleSave = () => {
    if (!form.title) return;
    const subTasks = form.sub_tasks_raw
      ? form.sub_tasks_raw.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    addTask({
      title: form.title,
      description: form.description || null,
      type: form.type,
      assigned_to: form.assigned_to || null,
      mentor_id: null,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      week_number: Number(form.week_number),
      is_viva: form.is_viva,
      track: form.track,
      sub_tasks: subTasks,
    });

    setForm({
      title: '',
      description: '',
      start_date: '',
      due_date: '',
      type: 'STUDENT_SPECIFIC',
      assigned_to: '',
      week_number: '1',
      is_viva: false,
      track: TRACKS[0],
      sub_tasks_raw: '',
    });
    setModalOpen(false);
  };

  const tableData = tasks.map(t => {
    let assignedName = 'All';
    if (t.assigned_to) {
      const prof = profiles.find(p => p.id === t.assigned_to);
      assignedName = prof?.name ?? t.assigned_to;
    }
    return { ...t, assigned_name: assignedName };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Week-wise Goals & Tasks</h1>
          <p className="text-gray-400 text-sm mt-1">Map out structured goals, viva checkpoints, and sub-tasks for each tech stack track</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200">
          <Plus size={18} />
          Create Task / Goal
        </button>
      </div>

      <DataTable
        columns={[
          { key: 'week_number', header: 'Timeline', render: (row) => (
            <span className="text-xs font-bold text-gold flex items-center gap-1">
              <Calendar size={13} />
              Week {row.week_number || '-'}
            </span>
          )},
          { key: 'track', header: 'Tech Stack/Track', render: (row) => (
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-gray-300 font-medium border border-zinc-700">
              {row.track || 'All'}
            </span>
          )},
          { key: 'title', header: 'Task Title', render: (row) => (
            <div>
              <span className="font-semibold text-white text-sm">{row.title}</span>
              {row.is_viva && (
                <span className="ml-2 text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                  Viva Checkpoint
                </span>
              )}
            </div>
          )},
          { key: 'sub_tasks', header: 'Sub-tasks (Checklist)', render: (row) => (
            <div className="max-w-xs space-y-1">
              {row.sub_tasks && row.sub_tasks.length > 0 ? (
                row.sub_tasks.map((st: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-1.5 text-xs text-gray-400">
                    <CheckSquare size={10} className="text-gold shrink-0" />
                    <span className="truncate">{st}</span>
                  </div>
                ))
              ) : (
                <span className="text-gray-600 text-xs">-</span>
              )}
            </div>
          )},
          {
            key: 'type',
            header: 'Target',
            render: (row) => (
              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${row.type === 'STUDENT_SPECIFIC' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/25' : 'bg-purple-500/10 text-purple-400 border border-purple-500/25'}`}>
                {row.type === 'STUDENT_SPECIFIC' ? 'Student' : 'Mentor'}
              </span>
            ),
          },
          { key: 'assigned_name', header: 'Assigned To' },
          { key: 'due_date', header: 'Deadline', render: (row) => (
            <span className="text-xs text-gray-300 font-mono">{row.due_date || '-'}</span>
          )},
        ]}
        data={tableData}
        searchPlaceholder="Search weekly goals..."
        actions={(row) => (
          <button onClick={() => deleteTask(row.id)} className="p-1.5 text-gray-400 hover:text-red-400 transition-colors">
            <Trash2 size={16} />
          </button>
        )}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Task / Weekly Goal">
        <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1 flex items-center gap-1">
                <Calendar size={14} className="text-gold" />
                Target Week
              </label>
              <select
                value={form.week_number}
                onChange={e => setForm({ ...form, week_number: e.target.value })}
                className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
              >
                {WEEKS.map(w => (
                  <option key={w} value={w}>Week {w}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1 flex items-center gap-1">
                <Layers size={14} className="text-gold" />
                Tech Stack/Track
              </label>
              <select
                value={form.track}
                onChange={e => setForm({ ...form, track: e.target.value })}
                className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
              >
                {TRACKS.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Goal / Task Title</label>
            <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g., Set up Database Architecture" className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Detailed Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Describe expectations or provide reference links..." rows={3} className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1 flex items-center gap-1">
              <Target size={14} className="text-gold" />
              Sub-tasks (Comma separated)
            </label>
            <input
              type="text"
              value={form.sub_tasks_raw}
              onChange={e => setForm({ ...form, sub_tasks_raw: e.target.value })}
              placeholder="e.g. Design DB Schema, Create migrations, Host locally"
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>

          <div className="flex items-center gap-2 py-1">
            <input
              type="checkbox"
              id="is_viva"
              checked={form.is_viva}
              onChange={e => setForm({ ...form, is_viva: e.target.checked })}
              className="w-4 h-4 rounded border-zinc-700 bg-zinc-750 text-gold focus:ring-gold"
            />
            <label htmlFor="is_viva" className="text-sm text-gray-300 cursor-pointer">
              Mark as Viva Evaluation Checkpoint
            </label>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Task Type</label>
            <div className="flex gap-2">
              <button onClick={() => setForm({ ...form, type: 'STUDENT_SPECIFIC', assigned_to: '' })} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${form.type === 'STUDENT_SPECIFIC' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-zinc-750 text-gray-400 border border-zinc-700'}`}>
                Student-Specific
              </button>
              <button onClick={() => setForm({ ...form, type: 'MENTOR_SPECIFIC', assigned_to: '' })} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${form.type === 'MENTOR_SPECIFIC' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-zinc-750 text-gray-400 border border-zinc-700'}`}>
                Mentor-Specific
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Assign To</label>
            <select value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold">
              <option value="">Select {form.type === 'STUDENT_SPECIFIC' ? 'Student' : 'Mentor'}...</option>
              {assignableList.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Start Date</label>
              <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Due Date</label>
              <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
            </div>
          </div>

          <button onClick={handleSave} className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors">
            Create Goal & Task
          </button>
        </div>
      </Modal>
    </div>
  );
}
