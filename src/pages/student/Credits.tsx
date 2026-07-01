import { useState } from 'react';
import { Plus } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import type { Credit, CreditRequest, Profile, CloudProvider } from '../../lib/types';

interface Props {
  studentId: string;
  credits: Credit[];
  creditRequests: CreditRequest[];
  profiles: Profile[];
  addCreditRequest: (req: Omit<CreditRequest, 'id' | 'mentor_status' | 'admin_status' | 'created_at'>) => void;
}

export default function StudentCredits({ studentId, credits, creditRequests, profiles, addCreditRequest }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ provider: 'AWS' as CloudProvider, amount: '', reason: '' });

  const myCredits = credits.filter((c) => c.student_id === studentId);
  const myRequests = creditRequests.filter((r) => r.student_id === studentId);

  const creditsData = myCredits.map((c) => {
    const student = profiles.find((p) => p.id === c.student_id);
    return {
      ...c,
      student_name: student?.name ?? '-',
    };
  }); 

  const handleSave = () => {
    if (!form.amount || !form.reason) return;
    addCreditRequest({
      student_id: studentId,
      provider: form.provider,
      amount: Number(form.amount),
      reason: form.reason,
    });
    setForm({ provider: 'AWS', amount: '', reason: '' });
    setModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">My Cloud Credits</h1>
          <p className="text-gray-400 text-sm mt-1">Review allocated voucher keys or request cloud credits from your mentor</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200"
        >
          <Plus size={18} />
          Request Credits
        </button>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-bold text-white">Assigned Voucher Keys</h2>
        <DataTable
          columns={[
            { key: 'provider', header: 'Provider' },
            { key: 'amount', header: 'Amount ($)' },
            { key: 'code', header: 'Voucher Code', render: (row: any) => (
              <span className="font-mono bg-zinc-800 text-gold px-2.5 py-0.5 rounded border border-zinc-700 font-bold text-xs">{row.code}</span>
            )},
            { key: 'expiry_date', header: 'Expiry Date' },
            { key: 'assigned_at', header: 'Assigned Date' },
          ]}
          data={creditsData as unknown as Record<string, unknown>[]}
          searchPlaceholder="Search vouchers..."
        />
      </div>

      <div className="space-y-4 pt-6 border-t border-zinc-750">
        <h2 className="text-lg font-bold text-white">My Credit Requests</h2>
        <DataTable
          columns={[
            { key: 'provider', header: 'Provider' },
            { key: 'amount', header: 'Requested ($)' },
            { key: 'reason', header: 'Reason Statement' },
            { key: 'mentor_status', header: 'Mentor Vouch', render: (row: any) => (
              <span className={`text-xs px-2.5 py-0.5 rounded font-semibold ${
                row.mentor_status === 'PENDING' ? 'bg-zinc-800 text-gray-400' :
                row.mentor_status === 'VOUCHED' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
              }`}>{row.mentor_status}</span>
            )},
            { key: 'admin_status', header: 'Admin Status', render: (row: any) => (
              <span className={`text-xs px-2.5 py-0.5 rounded font-semibold ${
                row.admin_status === 'PENDING' ? 'bg-zinc-800 text-gray-400' :
                row.admin_status === 'APPROVED' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
              }`}>{row.admin_status}</span>
            )},
            { key: 'code', header: 'Redemption Key', render: (row: any) => (
              row.code ? <span className="font-mono text-xs text-gold">{row.code}</span> : <span className="text-gray-600 text-xs">-</span>
            )},
            { key: 'created_at', header: 'Requested At' },
          ]}
          data={myRequests as unknown as Record<string, unknown>[]}
          searchPlaceholder="Search requests..."
        />
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Request Cloud Credits">
        <div className="space-y-4">
          <p className="text-xs text-gray-400">
            Submit a request for cloud platform credits. Your advisor/mentor will review and vouch for this request before admin approval.
          </p>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Provider</label>
            <select
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value as CloudProvider })}
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
              placeholder="e.g. 100"
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Justification Reason</label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Describe what resources will be deployed and why they are necessary..."
              rows={3}
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={!form.amount || !form.reason}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
          >
            Submit Request
          </button>
        </div>
      </Modal>
    </div>
  );
}
