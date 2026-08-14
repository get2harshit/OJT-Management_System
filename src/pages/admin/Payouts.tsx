import { useState, useEffect, useCallback, useMemo } from 'react';
import { Wallet, Check, DollarSign, PackagePlus, Download } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import type { Cohort } from '../../lib/types';
import {
  apiListCohorts,
  apiListPayouts,
  apiApprovePayout,
  apiMarkPayoutPaid,
  apiListBatches,
  apiGenerateBatch,
  apiDownloadBatchExport,
  type ApiSessionPayout,
  type ApiPayoutStatus,
  type ApiPayoutBatchSummary,
} from '../../lib/api';
import { getCohortLabel } from '../../lib/cohortLabel';
import { useToast } from '../../toast';

const STATUS_STYLES: Record<ApiPayoutStatus, string> = {
  pending: 'bg-zinc-750 text-gray-300 border border-zinc-700',
  approved: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  paid: 'bg-green-500/10 text-green-400 border border-green-500/20',
  void: 'bg-red-500/10 text-red-400 border border-red-500/20',
};

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
];

const MENTOR_TYPE_OPTIONS = [
  { value: 'internal', label: 'Internal' },
  { value: 'external', label: 'External' },
];

function formatSessionWhen(session: ApiSessionPayout['session']): string {
  const date = new Date(session.scheduled_date).toLocaleDateString();
  const start = new Date(session.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${start}`;
}

export default function AdminPayouts() {
  const { showSuccess, showError } = useToast();
  const [activeTab, setActiveTab] = useState<'payouts' | 'batches'>('payouts');

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortId, setCohortId] = useState('');
  const [status, setStatus] = useState('');
  const [mentorType, setMentorType] = useState('');

  const [payouts, setPayouts] = useState<ApiSessionPayout[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  const [batches, setBatches] = useState<ApiPayoutBatchSummary[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);

  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [batchMentorType, setBatchMentorType] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    apiListCohorts()
      .then(setCohorts)
      .catch(() => setCohorts([]));
  }, []);

  const loadPayouts = useCallback(
    async (page = pagination.page, limit = pagination.limit) => {
      setLoading(true);
      try {
        const res = await apiListPayouts({
          cohortId: cohortId || undefined,
          status: (status as ApiPayoutStatus) || undefined,
          mentorType: (mentorType as 'internal' | 'external') || undefined,
          page,
          limit,
        });
        setPayouts(res.data);
        setPagination({ page: res.pagination.page, limit: res.pagination.limit, total: res.pagination.total, totalPages: res.pagination.totalPages });
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to load payouts');
      } finally {
        setLoading(false);
      }
    },
    // pagination.page/limit intentionally excluded — this only re-derives when
    // filters change; page/limit changes are driven explicitly by DataTable's
    // callbacks below, which pass the target page/limit directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cohortId, status, mentorType, showError]
  );

  useEffect(() => {
    loadPayouts(1, pagination.limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohortId, status, mentorType]);

  const loadBatches = useCallback(async () => {
    setBatchesLoading(true);
    try {
      const res = await apiListBatches({ cohortId: cohortId || undefined, page: 1, limit: 50 });
      setBatches(res.data);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load payout batches');
    } finally {
      setBatchesLoading(false);
    }
  }, [cohortId, showError]);

  useEffect(() => {
    if (activeTab === 'batches') loadBatches();
  }, [activeTab, loadBatches]);

  const approve = async (id: string) => {
    try {
      const updated = await apiApprovePayout(id);
      setPayouts((prev) => prev.map((p) => (p.id === id ? updated : p)));
      showSuccess('Payout approved');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to approve payout');
    }
  };

  const markPaid = async (id: string) => {
    try {
      const updated = await apiMarkPayoutPaid(id);
      setPayouts((prev) => prev.map((p) => (p.id === id ? updated : p)));
      showSuccess('Payout marked paid');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to mark payout paid');
    }
  };

  const generateBatch = async () => {
    if (!periodStart || !periodEnd) return;
    setGenerating(true);
    try {
      const batch = await apiGenerateBatch({
        cohortId: cohortId || undefined,
        periodStart,
        periodEnd,
        mentorTypeFilter: (batchMentorType as 'internal' | 'external') || undefined,
      });
      showSuccess(`Batch generated — ${batch.entries.length} payouts, total ${batch.entries[0]?.currency_snapshot ?? ''} ${batch.total_amount}`);
      setBatchModalOpen(false);
      setPeriodStart('');
      setPeriodEnd('');
      setBatchMentorType('');
      loadPayouts(pagination.page, pagination.limit);
      if (activeTab === 'batches') loadBatches();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to generate payout batch');
    } finally {
      setGenerating(false);
    }
  };

  const cohortOptions = useMemo(() => cohorts.map((c) => ({ value: c.id, label: getCohortLabel(c) })), [cohorts]);

  return (
    <PageLayout mode={activeTab === 'payouts' ? 'fill' : 'scroll'} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Wallet size={24} className="text-gold" />
            Payouts
          </h1>
          <p className="text-gray-400 text-sm mt-1">Mentor session payouts and batch generation</p>
        </div>
        <button
          onClick={() => setBatchModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200"
        >
          <PackagePlus size={18} />
          Generate Batch
        </button>
      </div>

      <div className="flex border-b border-zinc-750">
        <button
          onClick={() => setActiveTab('payouts')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'payouts' ? 'border-gold text-gold' : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Payouts
        </button>
        <button
          onClick={() => setActiveTab('batches')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'batches' ? 'border-gold text-gold' : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Batches
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={cohortId} onChange={setCohortId} variant="filter" placeholder="All cohorts" className="w-[200px]" options={cohortOptions} />
        {activeTab === 'payouts' && (
          <>
            <Select value={status} onChange={setStatus} variant="filter" placeholder="All statuses" className="w-[160px]" options={STATUS_OPTIONS} />
            <Select value={mentorType} onChange={setMentorType} variant="filter" placeholder="All mentor types" className="w-[180px]" options={MENTOR_TYPE_OPTIONS} />
          </>
        )}
      </div>

      {activeTab === 'payouts' ? (
        <DataTable
          columns={[
            { key: 'mentorName', header: 'Mentor', render: (row) => (
              <span>
                {row.mentor.full_name}
                {row.mentor.is_external && <span className="text-[10px] text-gray-500 ml-1">(External)</span>}
              </span>
            ) },
            { key: 'sessionWhen', header: 'Session', render: (row) => formatSessionWhen(row.session) },
            { key: 'payable_hours', header: 'Hours' },
            { key: 'rate', header: 'Rate', render: (row) => `${row.currency_snapshot} ${row.hourly_rate_snapshot}` },
            { key: 'gross_amount', header: 'Amount', render: (row) => `${row.currency_snapshot} ${row.gross_amount}` },
            { key: 'status', header: 'Status', render: (row) => (
              <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${STATUS_STYLES[row.status]}`}>{row.status}</span>
            ) },
          ]}
          data={payouts.map((p) => ({ ...p, mentorName: p.mentor.full_name, sessionWhen: formatSessionWhen(p.session) }))}
          searchKeys={['mentorName']}
          searchPlaceholder="Search by mentor..."
          loading={loading}
          hideExport
          serverPagination={{
            page: pagination.page,
            limit: pagination.limit,
            totalPages: pagination.totalPages,
            total: pagination.total,
            onPageChange: (page) => loadPayouts(page, pagination.limit),
            onLimitChange: (limit) => loadPayouts(1, limit),
          }}
          actions={(row) => (
            <>
              {row.status === 'pending' && (
                <button
                  onClick={() => approve(row.id)}
                  className="p-1 px-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 text-xs font-semibold rounded transition-all flex items-center gap-1"
                >
                  <Check size={14} />
                  Approve
                </button>
              )}
              {row.status === 'approved' && (
                <button
                  onClick={() => markPaid(row.id)}
                  className="p-1 px-2.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 text-xs font-semibold rounded transition-all flex items-center gap-1"
                >
                  <DollarSign size={14} />
                  Mark Paid
                </button>
              )}
            </>
          )}
        />
      ) : (
        <DataTable
          fill={false}
          columns={[
            { key: 'period', header: 'Period', render: (row) => `${new Date(row.period_start).toLocaleDateString()} – ${new Date(row.period_end).toLocaleDateString()}` },
            { key: 'mentor_type_filter', header: 'Mentor Type', render: (row) => row.mentor_type_filter ?? 'All' },
            { key: 'total_amount', header: 'Total Amount' },
            { key: 'status', header: 'Status' },
            { key: 'generated_at', header: 'Generated At', render: (row) => new Date(row.generated_at).toLocaleString() },
          ]}
          data={batches}
          searchPlaceholder="Search batches..."
          loading={batchesLoading}
          hideExport
          actions={(row) => (
            <button
              onClick={() => apiDownloadBatchExport(row.id).catch((err) => showError(err instanceof Error ? err.message : 'Export failed'))}
              className="p-1 px-2.5 bg-zinc-750 hover:bg-zinc-700 text-gold text-xs font-semibold rounded transition-all flex items-center gap-1"
            >
              <Download size={14} />
              Export CSV
            </button>
          )}
        />
      )}

      <Modal open={batchModalOpen} onClose={() => setBatchModalOpen(false)} title="Generate Payout Batch">
        <div className="space-y-4">
          <p className="text-gray-400 text-xs">
            Bundles every approved, not-yet-batched payout in scope into one finalized batch{cohortId ? '' : ' (across all cohorts, since none is selected above)'}.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Period Start</label>
              <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Period End</label>
              <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Mentor Type (optional)</label>
            <Select value={batchMentorType} onChange={setBatchMentorType} placeholder="All mentor types" options={MENTOR_TYPE_OPTIONS} />
          </div>
          <button
            onClick={generateBatch}
            disabled={generating || !periodStart || !periodEnd}
            className="w-full text-sm px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate Batch'}
          </button>
        </div>
      </Modal>
    </PageLayout>
  );
}
