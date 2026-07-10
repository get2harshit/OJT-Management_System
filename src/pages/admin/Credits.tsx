import { useState } from 'react';
import { Plus, Check, X, ShieldAlert, Award } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import type { Credit, CreditRequest, Profile, Student, CloudProvider } from '../../lib/types';

import { useCredits } from '../../hooks/useCredits';
import { useData } from '../../context/DataContext';

interface Props {
  credits: Credit[];
  creditRequests: CreditRequest[];
  profiles: Profile[];
  students: Student[];
  addCredit: (credit: Omit<Credit, 'id' | 'assigned_at'>) => void;
  approveCreditRequest: (id: string, status: 'APPROVED' | 'REJECTED', code?: string) => void;
}

export default function AdminCredits({
  credits: propCredits,
  creditRequests: propCreditRequests,
  profiles: propProfiles,
  students: propStudents,
  addCredit: propAddCredit,
  approveCreditRequest: propApproveCreditRequest,
}: Partial<Props> = {}) {
  const { credits: hookCredits, creditRequests: hookCreditRequests, addCredit: hookAddCredit, approveCreditRequest: hookApproveCreditRequest } = useCredits();
  const { profiles: hookProfiles, students: hookStudents } = useData();

  const credits = propCredits ?? hookCredits;
  const creditRequests = propCreditRequests ?? hookCreditRequests;
  const profiles = propProfiles ?? hookProfiles;
  const students = propStudents ?? hookStudents;
  const addCredit = propAddCredit ?? hookAddCredit;
  const approveCreditRequest = propApproveCreditRequest ?? hookApproveCreditRequest;
  const [modalOpen, setModalOpen] = useState(false);
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);
  const [voucherCode, setVoucherCode] = useState('');
  const [form, setForm] = useState({ student_id: '', provider: 'AWS', amount: '', code: '', expiry_date: '' });
  const [activeSubTab, setActiveSubTab] = useState<'assigned' | 'requests'>('assigned');

  const creditsData = credits.map((c) => {
    const student = profiles.find((p) => p.id === c.student_id);
    return {
      ...c,
      student_name: student?.name ?? '-',
    };
  });

  const requestsData = creditRequests.map((r) => {
    const student = profiles.find((p) => p.id === r.student_id);
    return {
      ...r,
      student_name: student?.name ?? '-',
    };
  });

  // Filter requests to show vouched (high priority) and unvouched (potential spam)
  const vouchedRequests = requestsData.filter(r => r.mentor_status === 'VOUCHED' && r.admin_status === 'PENDING');
  const unvouchedRequests = requestsData.filter(r => r.mentor_status === 'PENDING' && r.admin_status === 'PENDING');

  const handleOpenApprove = (id: string) => {
    setSelectedReqId(id);
    setVoucherCode('');
    setApproveModalOpen(true);
  };

  const handleApprove = () => {
    if (!selectedReqId || !voucherCode.trim()) return;
    approveCreditRequest(selectedReqId, 'APPROVED', voucherCode.trim());
    setApproveModalOpen(false);
    setSelectedReqId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Cloud Credits Manager</h1>
          <p className="text-gray-400 text-sm mt-1">Review requests from students/mentors and allocate cloud vouchers</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200"
          >
            <Plus size={18} />
            Direct Assignment
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-750">
        <button
          onClick={() => setActiveSubTab('assigned')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeSubTab === 'assigned' ? 'border-gold text-gold' : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Assigned Vouchers ({credits.length})
        </button>
        <button
          onClick={() => setActiveSubTab('requests')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeSubTab === 'requests' ? 'border-gold text-gold' : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Incoming Requests ({vouchedRequests.length + unvouchedRequests.length})
        </button>
      </div>

      {activeSubTab === 'assigned' ? (
        <DataTable
          columns={[
            { key: 'student_name', header: 'Student' },
            { key: 'provider', header: 'Provider' },
            { key: 'amount', header: 'Amount ($)' },
            { key: 'code', header: 'Voucher Code' },
            { key: 'expiry_date', header: 'Expiry Date' },
          ]}
          data={creditsData}
          searchPlaceholder="Search assigned vouchers..."
        />
      ) : (
        <div className="space-y-8">
          {/* Vouched requests section */}
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-green-400 flex items-center gap-2">
              <Award size={18} />
              Verified Requests (Vouched by Mentor)
            </h2>
            <p className="text-gray-400 text-xs">These requests are vetted by mentors and are safe to approve.</p>
            <DataTable
              columns={[
                { key: 'student_name', header: 'Student' },
                { key: 'provider', header: 'Provider' },
                { key: 'amount', header: 'Requested ($)' },
                { key: 'reason', header: 'Reason' },
                { key: 'created_at', header: 'Requested At' },
              ]}
              data={vouchedRequests}
              searchPlaceholder="Search vouched requests..."
              actions={(row) => (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenApprove(row.id)}
                    className="p-1 px-2.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 text-xs font-semibold rounded transition-all flex items-center gap-1"
                  >
                    <Check size={14} />
                    Approve
                  </button>
                  <button
                    onClick={() => approveCreditRequest(row.id, 'REJECTED')}
                    className="p-1 px-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold rounded transition-all flex items-center gap-1"
                  >
                    <X size={14} />
                    Reject
                  </button>
                </div>
              )}
            />
          </div>

          {/* Unvouched requests section */}
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-yellow-500 flex items-center gap-2">
              <ShieldAlert size={18} />
              Unverified Requests (Potential Spam)
            </h2>
            <p className="text-gray-400 text-xs">Requests that have NOT been approved by a mentor yet. Can be reviewed if needed.</p>
            <DataTable
              columns={[
                { key: 'student_name', header: 'Student' },
                { key: 'provider', header: 'Provider' },
                { key: 'amount', header: 'Requested ($)' },
                { key: 'reason', header: 'Reason' },
                { key: 'created_at', header: 'Requested At' },
              ]}
              data={unvouchedRequests}
              searchPlaceholder="Search unverified requests..."
              actions={(row) => (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenApprove(row.id)}
                    className="p-1 px-2.5 bg-zinc-750 hover:bg-zinc-700 text-white text-xs font-semibold rounded transition-all flex items-center gap-1"
                  >
                    <Check size={14} />
                    Approve Anyway
                  </button>
                  <button
                    onClick={() => approveCreditRequest(row.id, 'REJECTED')}
                    className="p-1 px-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold rounded transition-all flex items-center gap-1"
                  >
                    <X size={14} />
                    Reject
                  </button>
                </div>
              )}
            />
          </div>
        </div>
      )}

      {/* Direct allocation modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Assign Cloud Credit">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Student</label>
            <Select
              value={form.student_id}
              onChange={v => setForm({ ...form, student_id: v })}
              className="w-full"
              placeholder="Select student"
              options={students.map(s => {
                const p = profiles.find((pr) => pr.id === s.user_id);
                return { value: s.user_id, label: p?.name ?? s.roll_number };
              })}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Provider</label>
            <Select
              value={form.provider}
              onChange={v => setForm({ ...form, provider: v })}
              className="w-full"
              options={['AWS', 'GCP', 'VULTR', 'AZURE', 'OTHER'].map(p => ({ value: p, label: p }))}
            />
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

      {/* Credit approval voucher entry modal */}
      <Modal open={approveModalOpen} onClose={() => setApproveModalOpen(false)} title="Approve Request & Provide Code">
        <div className="space-y-4">
          <p className="text-gray-300 text-sm">To approve this credit request, please assign a voucher redemption code below:</p>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Redemption Code</label>
            <input
              type="text"
              value={voucherCode}
              onChange={e => setVoucherCode(e.target.value)}
              placeholder="e.g., AWS-CREDIT-982X3"
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold font-mono"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleApprove}
              disabled={!voucherCode.trim()}
              className="flex-1 py-2 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-semibold rounded-lg transition-colors text-sm"
            >
              Confirm and Allocate
            </button>
            <button
              onClick={() => setApproveModalOpen(false)}
              className="px-4 py-2 bg-zinc-750 hover:bg-zinc-700 text-white font-semibold rounded-lg transition-colors text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
