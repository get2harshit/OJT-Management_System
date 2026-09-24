import { useState } from 'react';
import { Plus, Check, X, ShieldAlert, Award, Edit2, Trash2 } from 'lucide-react';
import DataTable from '../../components/DataTable';
import PageLayout from '../../components/PageLayout';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import ActionsMenu from '../../components/ActionsMenu';
import type { Credit, CreditRequest, PartnerPool, Profile, Student, CloudProvider } from '../../lib/types';

import { useCredits } from '../../hooks/useCredits';
import { useData } from '../../context/DataContext';
import { useConfirm } from '../../confirm';

// $1,500,000 rather than a bare 1500000 — used for both the on-screen table
// and the CSV export, so a partner's committed value reads the same way in
// both places instead of a spreadsheet full of unlabeled integers.
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount || 0);
}

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
  const { credits: hookCredits, creditRequests: hookCreditRequests, partnerPools, addCredit: hookAddCredit, approveCreditRequest: hookApproveCreditRequest, addPartnerPool, updatePartnerPool, deletePartnerPool } = useCredits();
  const { profiles: hookProfiles, students: hookStudents } = useData();
  const confirm = useConfirm();

  const credits = propCredits ?? hookCredits;
  const creditRequests = propCreditRequests ?? hookCreditRequests;
  const profiles = propProfiles ?? hookProfiles;
  const students = propStudents ?? hookStudents;
  const addCredit = propAddCredit ?? hookAddCredit;
  const approveCreditRequest = propApproveCreditRequest ?? hookApproveCreditRequest;
  const [modalOpen, setModalOpen] = useState(false);
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [partnerModalOpen, setPartnerModalOpen] = useState(false);
  // The pool being edited, or null while adding a new one — the same modal
  // and form serve both, so this is the only thing that tells them apart.
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null);
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);
  const [voucherCode, setVoucherCode] = useState('');
  const [form, setForm] = useState({ student_id: '', provider: 'AWS', amount: '', code: '', expiry_date: '' });
  const [partnerForm, setPartnerForm] = useState({
    partner_organization: '',
    partner_category: '',
    total_committed_value: '',
    pool_allocation: '',
    dollar_value_per_semester: '',
    unit_or_grant_offering: '',
    target_tracks_covered: '',
  });
  const [activeSubTab, setActiveSubTab] = useState<'assigned' | 'requests' | 'pools'>('assigned');

  const poolsData: PartnerPool[] = partnerPools;

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

  const handleAddPartner = () => {
    if (!partnerForm.partner_organization.trim() || !partnerForm.partner_category.trim()) return;
    const patch = {
      partner_organization: partnerForm.partner_organization.trim(),
      partner_category: partnerForm.partner_category.trim(),
      total_committed_value: Number(partnerForm.total_committed_value) || 0,
      pool_allocation: Number(partnerForm.pool_allocation) || 0,
      dollar_value_per_semester: Number(partnerForm.dollar_value_per_semester) || 0,
      unit_or_grant_offering: partnerForm.unit_or_grant_offering.trim(),
      target_tracks_covered: partnerForm.target_tracks_covered.trim(),
    };
    if (editingPartnerId) {
      updatePartnerPool(editingPartnerId, patch);
    } else {
      addPartnerPool(patch);
    }
    closePartnerModal();
  };

  const closePartnerModal = () => {
    setPartnerForm({
      partner_organization: '',
      partner_category: '',
      total_committed_value: '',
      pool_allocation: '',
      dollar_value_per_semester: '',
      unit_or_grant_offering: '',
      target_tracks_covered: '',
    });
    setEditingPartnerId(null);
    setPartnerModalOpen(false);
  };

  const openAddPartner = () => {
    setEditingPartnerId(null);
    setPartnerForm({
      partner_organization: '',
      partner_category: '',
      total_committed_value: '',
      pool_allocation: '',
      dollar_value_per_semester: '',
      unit_or_grant_offering: '',
      target_tracks_covered: '',
    });
    setPartnerModalOpen(true);
  };

  const openEditPartner = (pool: PartnerPool) => {
    setEditingPartnerId(pool.id);
    setPartnerForm({
      partner_organization: pool.partner_organization,
      partner_category: pool.partner_category,
      total_committed_value: String(pool.total_committed_value),
      pool_allocation: String(pool.pool_allocation),
      dollar_value_per_semester: String(pool.dollar_value_per_semester),
      unit_or_grant_offering: pool.unit_or_grant_offering,
      target_tracks_covered: pool.target_tracks_covered,
    });
    setPartnerModalOpen(true);
  };

  const handleDeletePartner = async (pool: PartnerPool) => {
    const confirmed = await confirm({
      title: 'Delete partner pool',
      message: `Remove ${pool.partner_organization} from the partner pools? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    deletePartnerPool(pool.id);
  };

  return (
    <PageLayout mode={activeSubTab === 'assigned' ? 'fill' : 'scroll'} className="space-y-6">
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
          <button
            onClick={openAddPartner}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-750 text-white font-semibold rounded-lg hover:bg-zinc-700 hover:scale-105 transition-all duration-200"
          >
            <Plus size={18} />
            Add Partner
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
        <button
          onClick={() => setActiveSubTab('pools')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeSubTab === 'pools' ? 'border-gold text-gold' : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Partner Pools ({partnerPools.length})
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
      ) : activeSubTab === 'pools' ? (
        <DataTable
          columns={[
            { key: 'partner_organization', header: 'Partner Organization' },
            { key: 'partner_category', header: 'Category' },
            {
              key: 'total_committed_value',
              header: 'Total Committed Value',
              render: (row) => formatCurrency(row.total_committed_value),
              exportValue: (row) => formatCurrency(row.total_committed_value),
            },
            {
              key: 'pool_allocation',
              header: 'Pool Allocation',
              render: (row) => formatCurrency(row.pool_allocation),
              exportValue: (row) => formatCurrency(row.pool_allocation),
            },
            {
              key: 'dollar_value_per_semester',
              header: 'Value / Semester',
              render: (row) => formatCurrency(row.dollar_value_per_semester),
              exportValue: (row) => formatCurrency(row.dollar_value_per_semester),
            },
            { key: 'unit_or_grant_offering', header: 'Unit / Grant Offering' },
            { key: 'target_tracks_covered', header: 'Target Tracks Covered' },
          ]}
          data={poolsData}
          searchPlaceholder="Search partner pools..."
          exportFilename="partner_pools"
          actions={(row) => (
            <ActionsMenu
              items={[
                { label: 'Edit', icon: Edit2, onClick: () => openEditPartner(row) },
                { label: 'Delete', icon: Trash2, onClick: () => handleDeletePartner(row), danger: true },
              ]}
            />
          )}
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
              fill={false}
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
              fill={false}
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

      {/* Add / edit partner pool modal */}
      <Modal open={partnerModalOpen} onClose={closePartnerModal} title={editingPartnerId ? 'Edit Partner' : 'Add Partner'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Partner Organization</label>
            <input
              type="text"
              value={partnerForm.partner_organization}
              onChange={(e) => setPartnerForm({ ...partnerForm, partner_organization: e.target.value })}
              placeholder="e.g., Vultr"
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Category</label>
            <input
              type="text"
              value={partnerForm.partner_category}
              onChange={(e) => setPartnerForm({ ...partnerForm, partner_category: e.target.value })}
              placeholder="e.g., Cloud & Infra"
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Total Committed Value ($)</label>
              <input
                type="number"
                value={partnerForm.total_committed_value}
                onChange={(e) => setPartnerForm({ ...partnerForm, total_committed_value: e.target.value })}
                className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Pool Allocation ($)</label>
              <input
                type="number"
                value={partnerForm.pool_allocation}
                onChange={(e) => setPartnerForm({ ...partnerForm, pool_allocation: e.target.value })}
                className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Value / Semester ($)</label>
              <input
                type="number"
                value={partnerForm.dollar_value_per_semester}
                onChange={(e) => setPartnerForm({ ...partnerForm, dollar_value_per_semester: e.target.value })}
                className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Unit / Grant Offering</label>
            <input
              type="text"
              value={partnerForm.unit_or_grant_offering}
              onChange={(e) => setPartnerForm({ ...partnerForm, unit_or_grant_offering: e.target.value })}
              placeholder="e.g., $300 / student"
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Target Tracks Covered</label>
            <input
              type="text"
              value={partnerForm.target_tracks_covered}
              onChange={(e) => setPartnerForm({ ...partnerForm, target_tracks_covered: e.target.value })}
              placeholder="e.g., App Dev, Product Dev"
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <button
            onClick={handleAddPartner}
            disabled={!partnerForm.partner_organization.trim() || !partnerForm.partner_category.trim()}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover disabled:opacity-50 transition-colors"
          >
            {editingPartnerId ? 'Save Changes' : 'Add Partner'}
          </button>
        </div>
      </Modal>
    </PageLayout>
  );
}
