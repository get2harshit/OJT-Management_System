import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import type { Task, Profile, Student, TaskType } from '../../lib/types';
import { useMentors } from '../../hooks/useMentors';
import { useStudentProfiles } from '../../hooks/useStudentProfiles';

interface Props {
  tasks: Task[];
  mentorId: string;
  profiles: Profile[];
  students: Student[];
  addTask: (task: Omit<Task, 'id' | 'created_at'>) => void;
  deleteTask: (id: string) => void;
}

export default function MentorTasks({ tasks, mentorId, profiles, students, addTask, deleteTask }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', start_date: '', due_date: '',
    type: 'STUDENT_SPECIFIC' as TaskType, assigned_to: '',
  });

  const studentProfiles = useStudentProfiles(profiles);
  const mentors = useMentors(profiles);

  const assignableList = form.type === 'STUDENT_SPECIFIC'
    ? students.map(s => {
        const prof = studentProfiles.find(p => p.id === s.user_id);
        return { id: s.user_id, label: `${prof?.name ?? s.user_id} (${s.roll_number})` };
      })
    : mentors.map(m => ({ id: m.id, label: m.name }));

  // Mentor sees tasks assigned to them or unassigned
  const myTasks = tasks.filter(t => t.mentor_id === mentorId || t.assigned_to === mentorId || t.assigned_to === null);

  const handleSave = () => {
    if (!form.title) return;
    addTask({
      title: form.title,
      description: form.description || null,
      type: form.type,
      assigned_to: form.assigned_to || null,
      mentor_id: mentorId,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
    });
    setForm({ title: '', description: '', start_date: '', due_date: '', type: 'STUDENT_SPECIFIC', assigned_to: '' });
    setModalOpen(false);
  };

  const tableData = myTasks.map(t => {
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
          <h1 className="text-2xl font-bold text-white">Tasks</h1>
          <p className="text-gray-400 text-sm mt-1">Manage tasks for your students</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200">
          <Plus size={18} />
          Add Task
        </button>
      </div>

      <DataTable
        columns={[
          { key: 'title', header: 'Title' },
          { key: 'description', header: 'Description' },
          {
            key: 'type',
            header: 'Type',
            render: (row) => (
              <span className={`text-xs px-2 py-0.5 rounded-full ${row.type === 'STUDENT_SPECIFIC' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}>
                {row.type === 'STUDENT_SPECIFIC' ? 'Student' : 'Mentor'}
              </span>
            ),
          },
          { key: 'assigned_name', header: 'Assigned To' },
          { key: 'start_date', header: 'Start Date' },
          { key: 'due_date', header: 'End Date' },
        ]}
        data={tableData}
        searchPlaceholder="Search tasks..."
        actions={(row) => (
          <div className="flex items-center gap-2">
            <button className="p-1.5 text-gray-400 hover:text-gold transition-colors">
              <Pencil size={16} />
            </button>
            <button onClick={() => deleteTask(row.id)} className="p-1.5 text-gray-400 hover:text-red-400 transition-colors">
              <Trash2 size={16} />
            </button>
          </div>
        )}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Task">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Title</label>
            <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
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
              <option value="">All {form.type === 'STUDENT_SPECIFIC' ? 'Students' : 'Mentors'}</option>
              {assignableList.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Start Date</label>
              <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">End Date</label>
              <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
            </div>
          </div>
          <button onClick={handleSave} className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors">
            Save Task
          </button>
        </div>
      </Modal>
    </div>
  );
}
