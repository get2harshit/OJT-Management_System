import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import type { Credit, Profile, Student, CloudProvider } from '../../lib/types';

interface Props {
  credits: Credit[];
  profiles: Profile[];
  students: Student[];
  addCredit: (credit: Omit<Credit, 'id' | 'assigned_at'>) => void;
}

export default function AdminCredits({ credits, profiles, students, addCredit }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ student_id: '', provider: 'AWS', amount: '', code: '', expiry_date: '' });

  const data = credits.map((c) => {
    const student = profiles.find((p) => p.id === c.student_id);
    return {
      ...c,
      student_name: student?.name ?? '-',
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Cloud Credits</h1>
          <p className="text-gray-400 text-sm mt-1">Manage cloud provider voucher assignments</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200"
        >
          <Plus size={18} />
          Assign Credit
        </button>
      </div>

      <DataTable
        columns={[
          { key: 'student_name', header: 'Student' },
          { key: 'provider', header: 'Provider' },
          { key: 'amount', header: 'Amount ($)' },
          { key: 'code', header: 'Code' },
          { key: 'expiry_date', header: 'Expiry' },
        ]}
        data={data}
        searchPlaceholder="Search credits..."
        actions={() => (
          <div className="flex items-center gap-2">
            <button className="p-1.5 text-gray-400 hover:text-red-400 transition-colors">
              <Trash2 size={16} />
            </button>
          </div>
        )}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Assign Cloud Credit">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Student</label>
            <select
              value={form.student_id}
              onChange={(e) => setForm({ ...form, student_id: e.target.value })}
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            >
              <option value="">Select student</option>
              {students.map((s) => {
                const p = profiles.find((pr) => pr.id === s.user_id);
                return (
                  <option key={s.user_id} value={s.user_id}>{p?.name ?? s.roll_number}</option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Provider</label>
            <select
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            >
              {['AWS', 'GCP', 'VULTR', 'AZURE', 'OTHER'].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Amount ($)</label>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Voucher Code</label>
            <input
              type="text"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Expiry Date</label>
            <input
              type="date"
              value={form.expiry_date}
              onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <button
            onClick={() => {
              if (!form.student_id || !form.amount || !form.code) return;
              addCredit({
                student_id: form.student_id,
                provider: form.provider as CloudProvider,
                amount: Number(form.amount),
                code: form.code,
                expiry_date: form.expiry_date || null,
              });
              setForm({ student_id: '', provider: 'AWS', amount: '', code: '', expiry_date: '' });
              setModalOpen(false);
            }}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors"
          >
            Assign Credit
          </button>
        </div>
      </Modal>
    </div>
  );
}
