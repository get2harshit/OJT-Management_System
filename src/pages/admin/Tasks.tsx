import { useState, useEffect } from 'react';
import { Plus, Trash2, Calendar, Target, CheckSquare, Layers } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import { TRACKS } from '../../lib/constants';

import { apiListTasks, apiCreateTask, apiDeleteTask } from '../../lib/api/tasks';
import { apiListMentors } from '../../lib/api/mentors';
import { apiListStudents } from '../../lib/api/students';
import type { ApiTask } from '../../lib/api/tasks';
import type { ApiMentor, ApiStudent } from '../../lib/types';
import Button from '../../components/Button';

const WEEKS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function AdminTasks() {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [mentors, setMentors] = useState<ApiMentor[]>([]);
  const [students, setStudents] = useState<ApiStudent[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    due_date: '',
    targetRole: 'student' as 'student' | 'mentor' | 'batch_manager',
    assigned_to: '',
    week_number: '1',
    track: TRACKS[0],
    sub_tasks_raw: '',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [tasksRes, mentorsRes, studentsRes] = await Promise.all([
        apiListTasks(),
        apiListMentors(),
        apiListStudents(),
      ]);
      setTasks(tasksRes.data || []);
      setMentors(mentorsRes || []);
      setStudents(studentsRes || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const assignableList = form.targetRole === 'student'
    ? students.map(s => ({ id: s.id, label: `${s.fullName || s.email} (${s.rollNumber || 'N/A'})` }))
    : mentors.map(m => ({ id: m.id, label: m.fullName || m.email || m.id }));

  const handleSave = async () => {
    if (!form.title) return;
    const subTasks = form.sub_tasks_raw
      ? form.sub_tasks_raw.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    await apiCreateTask({
      title: form.title,
      description: form.description || undefined,
      targetRole: form.targetRole,
      assignees: form.assigned_to ? [form.assigned_to] : undefined,
      deadline: form.due_date ? new Date(form.due_date).toISOString() : undefined,
      week: `Week ${form.week_number}`,
      track: form.track,
      subtasks: subTasks,
    });

    setForm({
      title: '',
      description: '',
      due_date: '',
      targetRole: 'student',
      assigned_to: '',
      week_number: '1',
      track: TRACKS[0],
      sub_tasks_raw: '',
    });
    setModalOpen(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    await apiDeleteTask(id);
    fetchData();
  };

  const tableData = tasks.map(t => {
    let assignedName = 'All';
    if (t.assignments && t.assignments.length > 0) {
      const first = t.assignments[0];
      assignedName = first.assignee ? first.assignee.full_name : first.assignee_id;
      if (t.assignments.length > 1) {
        assignedName += ` (+${t.assignments.length - 1} more)`;
      }
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
        <Button onClick={() => setModalOpen(true)} leftIcon={<Plus size={18} />} className="hover:scale-105">
          Create Task / Goal
        </Button>
      </div>

      <DataTable
        columns={[
          {
            key: 'week', header: 'Timeline', render: (row) => (
              <span className="text-xs font-bold text-gold flex items-center gap-1">
                <Calendar size={13} />
                {row.week || '-'}
              </span>
            )
          },
          {
            key: 'track', header: 'Tech Stack/Track', render: (row) => (
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-gray-300 font-medium border border-zinc-700">
                {row.track || 'All'}
              </span>
            )
          },
          {
            key: 'title', header: 'Task Title', render: (row) => (
              <div>
                <span className="font-semibold text-white text-sm">{row.title}</span>
              </div>
            )
          },
          {
            key: 'sub_tasks', header: 'Sub-tasks (Checklist)', render: (row) => (
              <div className="max-w-xs space-y-1">
                {row.subtasks && row.subtasks.length > 0 ? (
                  row.subtasks.map((st: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-1.5 text-xs text-gray-400">
                      <CheckSquare size={10} className="text-gold shrink-0" />
                      <span className="truncate">{st.title}</span>
                    </div>
                  ))
                ) : (
                  <span className="text-gray-600 text-xs">-</span>
                )}
              </div>
            )
          },
          {
            key: 'target_role',
            header: 'Target',
            render: (row) => (
              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${row.target_role === 'student' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/25' : 'bg-purple-500/10 text-purple-400 border border-purple-500/25'}`}>
                {row.target_role === 'student' ? 'Student' : row.target_role === 'mentor' ? 'Mentor' : 'Batch Manager'}
              </span>
            ),
          },
          { key: 'assigned_name', header: 'Assigned To' },
          {
            key: 'deadline', header: 'Deadline', render: (row) => (
              <span className="text-xs text-gray-300 font-mono">
                {row.deadline ? new Date(row.deadline).toLocaleDateString() : '-'}
              </span>
            )
          },
        ]}
        data={tableData}
        searchPlaceholder="Search weekly goals..."
        actions={(row) => (
          <Button variant="ghost" size="sm" onClick={() => handleDelete(row.id)} className="p-1.5 hover:text-red-400">
            <Trash2 size={16} />
          </Button>
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
              <Select
                value={form.week_number}
                onChange={v => setForm({ ...form, week_number: v })}
                className="w-full"
                options={WEEKS.map(w => ({ value: String(w), label: `Week ${w}` }))}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1 flex items-center gap-1">
                <Layers size={14} className="text-gold" />
                Tech Stack/Track
              </label>
              <Select
                value={form.track}
                onChange={v => setForm({ ...form, track: v })}
                className="w-full"
                options={TRACKS.map(t => ({ value: t, label: t }))}
              />
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

          <div>
            <label className="block text-sm text-gray-400 mb-1">Task Target Role</label>
            <div className="flex gap-2">
              <Button
                variant={form.targetRole === 'student' ? 'blue' : 'secondary'}
                onClick={() => setForm({ ...form, targetRole: 'student', assigned_to: '' })}
                className="flex-1"
              >
                Student
              </Button>
              <Button
                variant={form.targetRole === 'mentor' ? 'purple' : 'secondary'}
                onClick={() => setForm({ ...form, targetRole: 'mentor', assigned_to: '' })}
                className="flex-1"
              >
                Mentor
              </Button>
              <Button
                variant={form.targetRole === 'batch_manager' ? 'purple' : 'secondary'}
                onClick={() => setForm({ ...form, targetRole: 'batch_manager', assigned_to: '' })}
                className="flex-1"
              >
                Batch Manager
              </Button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Assign To</label>
            <Select
              value={form.assigned_to}
              onChange={v => setForm({ ...form, assigned_to: v })}
              className="w-full"
              placeholder={`Select ${form.targetRole}...`}
              options={assignableList.map(a => ({ value: a.id, label: a.label }))}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Due Date</label>
            <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
          </div>

          <Button onClick={handleSave} fullWidth size="lg">
            Create Goal & Task
          </Button>
        </div>
      </Modal>
    </div>
  );
}
