import { useState } from 'react';
import { Plus, Pencil, Trash2, CheckCircle2 } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import type { Semester } from '../../lib/types';

interface Props {
  semesters: Semester[];
}

export default function AdminSemesters({ semesters }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Semesters</h1>
          <p className="text-gray-400 text-sm mt-1">Manage academic semesters</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200"
        >
          <Plus size={18} />
          Add Semester
        </button>
      </div>

      <DataTable
        columns={[
          { key: 'name', header: 'Name' },
          { key: 'start_date', header: 'Start Date' },
          { key: 'end_date', header: 'End Date' },
          {
            key: 'is_active',
            header: 'Status',
            render: (row) =>
              row.is_active ? (
                <span className="inline-flex items-center gap-1 text-green-400 text-xs">
                  <CheckCircle2 size={14} /> Active
                </span>
              ) : (
                <span className="text-gray-500 text-xs">Inactive</span>
              ),
          },
        ]}
        data={semesters}
        searchPlaceholder="Search semesters..."
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Semester">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">End Date</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
              />
            </div>
          </div>
          <button
            onClick={() => setModalOpen(false)}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors"
          >
            Save Semester
          </button>
        </div>
      </Modal>
    </div>
  );
}
