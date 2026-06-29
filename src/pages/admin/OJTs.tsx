import { useState } from 'react';
import { Plus, Trash2, Calendar } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import type { OJT } from '../../lib/types';
import { getDurationString } from '../../lib/utils';

interface Props {
  ojts: OJT[];
  addOJT: (ojt: Omit<OJT, 'id' | 'created_at'>) => void;
  deleteOJT: (id: string) => void;
}

export default function AdminOJTs({ ojts, addOJT, deleteOJT }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '' });

  const handleSave = () => {
    if (!form.name || !form.start_date || !form.end_date) return;
    addOJT({ name: form.name, start_date: form.start_date, end_date: form.end_date });
    setForm({ name: '', start_date: '', end_date: '' });
    setModalOpen(false);
  };

  const data = ojts.map(o => ({
    ...o,
    duration: getDurationString(o.start_date, o.end_date),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">OJT Programs</h1>
          <p className="text-gray-400 text-sm mt-1">Create and manage OJT runs with start/close dates</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200"
        >
          <Plus size={18} />
          Create OJT
        </button>
      </div>

      <DataTable
        columns={[
          { key: 'name', header: 'OJT Name' },
          { key: 'start_date', header: 'Start Date' },
          { key: 'end_date', header: 'End Date' },
          {
            key: 'duration',
            header: 'Duration',
            render: (row) => (
              <span className="flex items-center gap-1 text-gray-300 text-xs">
                <Calendar size={14} className="text-gold" />
                {row.duration}
              </span>
            ),
          },
        ]}
        data={data}
        searchPlaceholder="Search OJTs..."
        actions={(row) => (
          <button onClick={() => deleteOJT(row.id)} className="p-1.5 text-gray-400 hover:text-red-400 transition-colors">
            <Trash2 size={16} />
          </button>
        )}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Create OJT Program">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">OJT Name</label>
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. OJT Program — Fall 2024" className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Start Date</label>
            <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">End Date</label>
            <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
          </div>
          <button onClick={handleSave} className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors">
            Create OJT
          </button>
        </div>
      </Modal>
    </div>
  );
}
