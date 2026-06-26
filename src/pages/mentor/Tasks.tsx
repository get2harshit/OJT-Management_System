import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import type { Task } from '../../lib/types';

interface Props {
  tasks: Task[];
  mentorId: string;
}

export default function MentorTasks({ tasks, mentorId }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', due_date: '' });

  const myTasks = tasks.filter((t) => t.mentor_id === mentorId || t.is_common);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Tasks</h1>
          <p className="text-gray-400 text-sm mt-1">Manage tasks for your students</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200"
        >
          <Plus size={18} />
          Add Task
        </button>
      </div>

      <DataTable
        columns={[
          { key: 'title', header: 'Title' },
          { key: 'description', header: 'Description' },
          { key: 'due_date', header: 'Due Date' },
        ]}
        data={myTasks}
        searchPlaceholder="Search tasks..."
        actions={() => (
          <div className="flex items-center gap-2">
            <button className="p-1.5 text-gray-400 hover:text-gold transition-colors">
              <Pencil size={16} />
            </button>
            <button className="p-1.5 text-gray-400 hover:text-red-400 transition-colors">
              <Trash2 size={16} />
            </button>
          </div>
        )}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Task">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Due Date</label>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <button
            onClick={() => setModalOpen(false)}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors"
          >
            Save Task
          </button>
        </div>
      </Modal>
    </div>
  );
}
