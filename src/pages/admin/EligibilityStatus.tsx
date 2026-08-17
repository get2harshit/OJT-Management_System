import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck, Upload, Pencil, Trash2 } from 'lucide-react';
import DataTable from '../../components/DataTable';
import PageLayout from '../../components/PageLayout';
import Modal from '../../components/Modal';
import ActionsMenu from '../../components/ActionsMenu';
import SpinnerSquare from '../../components/SpinnerSquare';
import EligibilityCsvImportModal from './EligibilityCsvImportModal';
import type { EligibilityStatus, EligibilityStatusInput } from '../../lib/types';
import {
  apiListEligibilityStatuses,
  apiUpdateEligibilityStatus,
  apiDeleteEligibilityStatus,
} from '../../lib/api';
import type { EligibilityBulkFlag } from '../../lib/api';
import { useToast } from '../../toast';
import { useConfirm } from '../../confirm';
import { usePageRefresh } from '../../context/RefreshContext';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

const EMPTY_FORM: EligibilityStatusInput = {
  msuEmail: '',
  msuRegistrationNumber: '',
  isOpenSource: false,
  feePending: false,
  isIntern: false,
};

export default function EligibilityStatusPage() {
  const { showSuccess, showError } = useToast();
  const confirm = useConfirm();

  const [rows, setRows] = useState<EligibilityStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });

  // Editing an existing row only — new rows come exclusively from the CSV
  // bulk import below, never from a manual single-row form.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<EligibilityStatusInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  // Which bulk upload is open, or null for none — one piece of state rather
  // than a boolean per flag, so two can never be open at once.
  const [csvModalFlag, setCsvModalFlag] = useState<EligibilityBulkFlag | null>(null);

  const fetchRows = useCallback(async () => {
    try {
      const res = await apiListEligibilityStatuses({ page, limit, search: search || undefined });
      setRows(res.data);
      setPagination(res.pagination);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load eligibility statuses');
      setRows([]);
    }
  }, [page, limit, search, showError]);

  useEffect(() => {
    setTableLoading(true);
    fetchRows().finally(() => {
      setTableLoading(false);
      setLoading(false);
    });
  }, [fetchRows]);

  usePageRefresh(fetchRows);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearchChange = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleLimitChange = (value: number) => {
    setPage(1);
    setLimit(value);
  };

  const openEditModal = (row: EligibilityStatus) => {
    setEditingId(row.id);
    setForm({
      msuEmail: row.msuEmail,
      msuRegistrationNumber: row.msuRegistrationNumber ?? '',
      isOpenSource: row.isOpenSource,
      feePending: row.feePending,
      isIntern: row.isIntern,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!editingId) return;
    const email = form.msuEmail.trim();
    if (!email) {
      showError('MSU email is required');
      return;
    }
    setSaving(true);
    try {
      const payload: EligibilityStatusInput = {
        msuEmail: email,
        msuRegistrationNumber: form.msuRegistrationNumber?.trim() || null,
        isOpenSource: form.isOpenSource,
        feePending: form.feePending,
        isIntern: form.isIntern,
      };
      await apiUpdateEligibilityStatus(editingId, payload);
      showSuccess('Eligibility status updated');
      closeModal();
      await fetchRows();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save eligibility status');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: EligibilityStatus) => {
    const confirmed = await confirm({
      title: 'Remove eligibility row',
      message: `Remove the eligibility row for ${row.msuEmail}? Without a row, this address is treated as having no eligibility data — sign-in is not blocked either way.`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await apiDeleteEligibilityStatus(row.id);
      showSuccess('Eligibility row removed');
      await fetchRows();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to remove eligibility row');
    }
  };

  const StatusPill = ({ ok, label }: { ok: boolean; label: string }) => (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
        ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      {label}
    </span>
  );

  return (
    <PageLayout className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="text-gold" size={26} />
            OJT Eligibility Status
          </h1>
          <p className="text-sm text-gray-400 max-w-2xl">
            Fee Pending and Intern both refuse a student at sign-in, before they can reach any cohort, and
            keep them off teams. An intern is told to contact a coordinator if they want to switch to OJT; a
            fee-pending student is told to contact their administrator. An address with no row here is not
            blocked. Open Source is recorded but nothing currently reads it.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setCsvModalFlag('feePending')}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-gold text-black rounded-lg hover:bg-gold-hover transition-colors shadow-sm"
          >
            <Upload size={15} />
            Bulk Update Fee Pending
          </button>
          <button
            onClick={() => setCsvModalFlag('isIntern')}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-zinc-800 text-white border border-zinc-700 rounded-lg hover:bg-zinc-750 transition-colors shadow-sm"
          >
            <Upload size={15} />
            Bulk Mark Interns
          </button>
        </div>
      </div>

      {loading ? (
        <div className="min-h-[50vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : (
        <DataTable
          loading={tableLoading}
          columns={[
            { key: 'msuEmail', header: 'MSU Email' },
            {
              key: 'msuRegistrationNumber',
              header: 'MSU Registration No.',
              render: (row: EligibilityStatus) => row.msuRegistrationNumber || <span className="text-gray-600">—</span>,
            },
            {
              // ok=true (green) means "not pending" — same red/green sense as
              // every other pill on this row, just keyed off the inverted field.
              key: 'feePending',
              header: 'Fee Status',
              render: (row: EligibilityStatus) => (
                <StatusPill ok={!row.feePending} label={row.feePending ? 'Pending' : 'Paid'} />
              ),
            },
            {
              key: 'isOpenSource',
              header: 'Open Source',
              render: (row: EligibilityStatus) => <StatusPill ok={row.isOpenSource} label={row.isOpenSource ? 'Yes' : 'No'} />,
            },
            {
              // Inverted like Fee Status, not like Open Source: Intern now
              // blocks sign-in, so green has to mean "can get in". A green
              // "Yes" here would read as the opposite of what it does.
              key: 'isIntern',
              header: 'Intern',
              render: (row: EligibilityStatus) => <StatusPill ok={!row.isIntern} label={row.isIntern ? 'Yes' : 'No'} />,
            },
          ]}
          data={rows}
          searchPlaceholder="Search by email or registration number..."
          onSearchChange={handleSearchChange}
          serverPagination={{
            page: pagination.page,
            limit: pagination.limit,
            total: pagination.total,
            totalPages: pagination.totalPages,
            onPageChange: setPage,
            onLimitChange: handleLimitChange,
          }}
          actions={(row: EligibilityStatus) => (
            <ActionsMenu
              items={[
                { label: 'Edit', icon: Pencil, onClick: () => openEditModal(row) },
                { label: 'Remove', icon: Trash2, onClick: () => handleDelete(row), danger: true },
              ]}
            />
          )}
        />
      )}

      <Modal open={modalOpen} onClose={closeModal} title="Edit Eligibility Row">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">MSU Email</label>
            <input
              type="email"
              value={form.msuEmail}
              onChange={(e) => setForm((f) => ({ ...f, msuEmail: e.target.value }))}
              placeholder="student@marwadiuniversity.ac.in"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition-all"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              MSU Registration Number <span className="text-gray-600">(optional)</span>
            </label>
            <input
              type="text"
              value={form.msuRegistrationNumber ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, msuRegistrationNumber: e.target.value }))}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition-all"
            />
          </div>

          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.feePending ?? false}
                onChange={(e) => setForm((f) => ({ ...f, feePending: e.target.checked }))}
                className="rounded bg-zinc-750 border-zinc-650 accent-gold focus:ring-gold"
              />
              Fee Pending
              <span className="text-xs text-gray-500">— checking this blocks sign-in immediately</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isOpenSource ?? false}
                onChange={(e) => setForm((f) => ({ ...f, isOpenSource: e.target.checked }))}
                className="rounded bg-zinc-750 border-zinc-650 accent-gold focus:ring-gold"
              />
              Open Source
              <span className="text-xs text-gray-500">— not enforced yet</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isIntern ?? false}
                onChange={(e) => setForm((f) => ({ ...f, isIntern: e.target.checked }))}
                className="rounded bg-zinc-750 border-zinc-650 accent-gold focus:ring-gold"
              />
              Intern
              <span className="text-xs text-gray-500">— checking this blocks sign-in immediately</span>
            </label>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </Modal>

      {csvModalFlag && (
        <EligibilityCsvImportModal
          open
          flag={csvModalFlag}
          onClose={() => setCsvModalFlag(null)}
          onImportSuccess={fetchRows}
        />
      )}
    </PageLayout>
  );
}
