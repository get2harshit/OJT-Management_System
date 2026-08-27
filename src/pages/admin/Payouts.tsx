import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Wallet, Check, DollarSign, PackagePlus, Download, Tag, X, Eye } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import type { Cohort, ApiMentor } from '../../lib/types';
import {
  apiListCohorts,
  apiListMentorsPage,
  apiListPayouts,
  apiApprovePayout,
  apiMarkPayoutPaid,
  apiListBatches,
  apiGenerateBatch,
  apiGetBatchById,
  apiDownloadBatchExport,
  apiGetCurrentRatesForMentors,
  apiListMentorRates,
  apiSetMentorRate,
  RATE_TYPE_LABELS,
  RATE_TYPE_UNITS,
  type ApiSessionPayout,
  type ApiPayoutStatus,
  type ApiPayoutBatchSummary,
  type ApiPayoutBatch,
  type ApiMentorRate,
  type ApiRateType,
} from '../../lib/api';
import { getCohortLabel } from '../../lib/cohortLabel';
import { formatDuration } from '../../lib/utils';
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

const RATE_TYPE_OPTIONS = (Object.keys(RATE_TYPE_LABELS) as ApiRateType[]).map((value) => ({
  value,
  label: RATE_TYPE_LABELS[value],
}));

const CURRENCY_OPTIONS = [
  { value: 'INR', label: 'INR' },
  { value: 'USD', label: 'USD' },
];

function describeRate(rate: ApiMentorRate): string {
  return `${rate.currency} ${rate.rate_amount}${RATE_TYPE_UNITS[rate.rate_type]}`;
}

export default function AdminPayouts() {
  const { showSuccess, showError } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'payouts' | 'batches' | 'rates'>('payouts');

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  // Seeded from a ?cohortId= link (e.g. the OJT Setup Payouts tab) so
  // arriving from a specific cohort pre-filters to it — the filter itself
  // stays free-standing so "all cohorts" is still one click away.
  const [cohortId, setCohortId] = useState(searchParams.get('cohortId') || '');
  const [status, setStatus] = useState('');
  const [mentorType, setMentorType] = useState('');
  // Set only via a ?mentorId= link in (e.g. the Mentor Workspace's "this
  // mentor's payouts" link) — no picker in this UI for it, since the point is
  // a scoped deep link, not a filter someone hand-picks from a mentor list.
  const [mentorId, setMentorId] = useState(searchParams.get('mentorId') || '');
  const [mentorFilterName, setMentorFilterName] = useState('');

  const [payouts, setPayouts] = useState<ApiSessionPayout[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  const [batches, setBatches] = useState<ApiPayoutBatchSummary[]>([]);
  const [batchDetail, setBatchDetail] = useState<ApiPayoutBatch | null>(null);
  const [batchDetailLoading, setBatchDetailLoading] = useState(false);
  const [batchesLoading, setBatchesLoading] = useState(false);

  const [mentors, setMentors] = useState<ApiMentor[]>([]);
  const [currentRates, setCurrentRates] = useState<Record<string, ApiMentorRate>>({});
  const [ratesLoading, setRatesLoading] = useState(false);

  // The mentor whose rate is being set, that form's state, and their history.
  const [rateTarget, setRateTarget] = useState<ApiMentor | null>(null);
  const [rateAmount, setRateAmount] = useState('');
  const [rateType, setRateType] = useState<ApiRateType>('per_hour');
  const [rateCurrency, setRateCurrency] = useState('INR');
  const [rateNote, setRateNote] = useState('');
  const [rateHistory, setRateHistory] = useState<ApiMentorRate[]>([]);
  const [savingRate, setSavingRate] = useState(false);

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
          mentorId: mentorId || undefined,
          page,
          limit,
        });
        setPayouts(res.data);
        setPagination({ page: res.pagination.page, limit: res.pagination.limit, total: res.pagination.total, totalPages: res.pagination.totalPages });
        // Every row shares the same mentor while this filter is active, so
        // the first row's name is enough — no separate mentor fetch needed.
        setMentorFilterName(mentorId ? res.data[0]?.mentor.full_name ?? '' : '');
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
    [cohortId, status, mentorType, mentorId, showError]
  );

  useEffect(() => {
    loadPayouts(1, pagination.limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohortId, status, mentorType, mentorId]);

  const clearMentorFilter = () => {
    setMentorId('');
    setMentorFilterName('');
    const next = new URLSearchParams(searchParams);
    next.delete('mentorId');
    setSearchParams(next, { replace: true });
  };

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

  const loadRates = useCallback(async () => {
    setRatesLoading(true);
    try {
      const mentorsRes = await apiListMentorsPage({ page: 1, limit: 200, cohortId: cohortId || undefined });
      setMentors(mentorsRes.data);
      // One request for the whole visible roster rather than one per mentor.
      setCurrentRates(await apiGetCurrentRatesForMentors(mentorsRes.data.map((m) => m.id)));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load mentor rates');
    } finally {
      setRatesLoading(false);
    }
  }, [cohortId, showError]);

  useEffect(() => {
    if (activeTab === 'rates') loadRates();
  }, [activeTab, loadRates]);

  const openRateModal = async (mentor: ApiMentor) => {
    const existing = currentRates[mentor.id];
    setRateTarget(mentor);
    // Seeded from their current rate so "bump this mentor's rate" starts from
    // what they're actually on, not from an empty form.
    setRateAmount(existing ? String(Number(existing.rate_amount)) : '');
    setRateType(existing?.rate_type ?? 'per_hour');
    setRateCurrency(existing?.currency ?? 'INR');
    setRateNote('');
    setRateHistory([]);
    try {
      setRateHistory(await apiListMentorRates(mentor.id));
    } catch {
      // History is context, not the point of the screen — a failure here
      // shouldn't stop the admin setting a rate.
    }
  };

  const saveRate = async () => {
    if (!rateTarget) return;
    const amount = Number(rateAmount);
    if (!(amount > 0)) {
      showError('Enter a rate amount greater than zero');
      return;
    }
    setSavingRate(true);
    try {
      const saved = await apiSetMentorRate(rateTarget.id, {
        rateAmount: amount,
        rateType,
        currency: rateCurrency as 'INR' | 'USD',
        note: rateNote.trim() || undefined,
      });
      setCurrentRates((prev) => ({ ...prev, [rateTarget.id]: saved }));
      showSuccess(`Rate set for ${rateTarget.fullName ?? rateTarget.email}`);
      setRateTarget(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to set rate');
    } finally {
      setSavingRate(false);
    }
  };

  // A decided row that no longer matches the active status filter must leave
  // the list rather than sit there updated-but-stale — otherwise it's still
  // clickable under e.g. a "Pending" filter after it stopped being pending,
  // which is how a second Approve/Mark Paid on the same row would end up
  // hitting the backend's "wrong state" 409 instead of just not being possible.
  const reconcileAfterDecision = (prev: ApiSessionPayout[], updated: ApiSessionPayout) =>
    status && updated.status !== status ? prev.filter((p) => p.id !== updated.id) : prev.map((p) => (p.id === updated.id ? updated : p));

  const approve = async (id: string) => {
    try {
      const updated = await apiApprovePayout(id);
      setPayouts((prev) => reconcileAfterDecision(prev, updated));
      showSuccess('Payout approved');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to approve payout');
    }
  };

  const markPaid = async (id: string) => {
    try {
      const updated = await apiMarkPayoutPaid(id);
      setPayouts((prev) => reconcileAfterDecision(prev, updated));
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
      showSuccess(`Batch generated — ${batch.entries.length} session${batch.entries.length === 1 ? '' : 's'}. Export the batch as CSV to get the payable amounts.`);
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

  // The batches list only ever carries the summary (period/total/status) —
  // this is the only way to see which specific payouts a given batch bundled,
  // which matters for the same reason CSV export does: proving to an
  // external mentor exactly what they were paid for.
  const viewBatch = async (id: string) => {
    setBatchDetailLoading(true);
    try {
      setBatchDetail(await apiGetBatchById(id));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load batch detail');
    } finally {
      setBatchDetailLoading(false);
    }
  };

  const cohortOptions = useMemo(() => cohorts.map((c) => ({ value: c.id, label: getCohortLabel(c) })), [cohorts]);

  // Batches is the only tab that stacks content below its table, so it's the
  // only one that scrolls as a whole; the others hand their leftover height
  // to a single filling table.
  return (
    <PageLayout mode={activeTab === 'batches' ? 'scroll' : 'fill'} className="space-y-6">
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
        <button
          onClick={() => setActiveTab('rates')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'rates' ? 'border-gold text-gold' : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Mentor Rates
        </button>
      </div>

      {activeTab === 'payouts' && mentorId && (
        <div className="flex items-center gap-2 text-xs bg-gold/10 border border-gold/20 text-gold rounded-lg px-3 py-2 w-fit">
          <span>Showing only {mentorFilterName || 'this mentor'}&apos;s payouts</span>
          <button onClick={clearMentorFilter} className="hover:text-white transition-colors" aria-label="Clear mentor filter">
            <X size={13} />
          </button>
        </div>
      )}

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
            { key: 'duration', header: 'Duration', render: (row) => formatDuration(row.session) },
            { key: 'payable_hours', header: 'Payable Hours' },
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
      ) : activeTab === 'rates' ? (
        <DataTable
          columns={[
            { key: 'mentorName', header: 'Mentor', render: (row) => (
              <span>
                {row.fullName ?? row.email}
                {row.isExternal && <span className="text-[10px] text-gray-500 ml-1">(External)</span>}
              </span>
            ) },
            { key: 'rateModel', header: 'Rate Model', render: (row) => {
              const rate = currentRates[row.id];
              return rate ? RATE_TYPE_LABELS[rate.rate_type] : <span className="text-gray-500">—</span>;
            } },
            { key: 'currentRate', header: 'Current Rate', render: (row) => {
              const rate = currentRates[row.id];
              return rate ? (
                <span className="text-white font-medium">{describeRate(rate)}</span>
              ) : (
                <span className="text-amber-400/80 text-xs">Not set — sessions won’t generate a payout</span>
              );
            } },
            { key: 'effectiveFrom', header: 'Effective From', render: (row) => {
              const rate = currentRates[row.id];
              return rate ? new Date(rate.effective_from).toLocaleDateString() : '—';
            } },
          ]}
          data={mentors.map((m) => ({ ...m, mentorName: m.fullName ?? m.email ?? '' }))}
          searchKeys={['mentorName']}
          searchPlaceholder="Search mentors..."
          loading={ratesLoading}
          hideExport
          actions={(row) => (
            <button
              onClick={() => openRateModal(row)}
              className="p-1 px-2.5 bg-zinc-750 hover:bg-zinc-700 text-gold text-xs font-semibold rounded transition-all flex items-center gap-1"
            >
              <Tag size={14} />
              {currentRates[row.id] ? 'Change Rate' : 'Set Rate'}
            </button>
          )}
        />
      ) : (
        <DataTable
          fill={false}
          columns={[
            { key: 'period', header: 'Period', render: (row) => `${new Date(row.period_start).toLocaleDateString()} – ${new Date(row.period_end).toLocaleDateString()}` },
            { key: 'mentor_type_filter', header: 'Mentor Type', render: (row) => row.mentor_type_filter ?? 'All' },
            { key: 'status', header: 'Status' },
            { key: 'generated_at', header: 'Generated At', render: (row) => new Date(row.generated_at).toLocaleString() },
          ]}
          data={batches}
          searchPlaceholder="Search batches..."
          loading={batchesLoading}
          hideExport
          actions={(row) => (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => viewBatch(row.id)}
                className="p-1 px-2.5 bg-zinc-750 hover:bg-zinc-700 text-gold text-xs font-semibold rounded transition-all flex items-center gap-1"
              >
                <Eye size={14} />
                View
              </button>
              <button
                onClick={() => apiDownloadBatchExport(row.id).catch((err) => showError(err instanceof Error ? err.message : 'Export failed'))}
                className="p-1 px-2.5 bg-zinc-750 hover:bg-zinc-700 text-gold text-xs font-semibold rounded transition-all flex items-center gap-1"
              >
                <Download size={14} />
                Export CSV
              </button>
            </div>
          )}
        />
      )}

      <Modal open={!!batchDetail || batchDetailLoading} onClose={() => setBatchDetail(null)} title="Batch Detail" size="lg">
        {batchDetailLoading ? (
          <div className="py-8 flex justify-center">
            <span className="text-gray-500 text-sm">Loading…</span>
          </div>
        ) : batchDetail ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">
              {new Date(batchDetail.period_start).toLocaleDateString()} – {new Date(batchDetail.period_end).toLocaleDateString()} ·{' '}
              {batchDetail.entries.length} session{batchDetail.entries.length === 1 ? '' : 's'} · {batchDetail.status}
            </p>
            <div className="max-h-[60vh] overflow-y-auto space-y-1.5">
              {batchDetail.entries.map((e) => (
                <div key={e.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-xs">
                  <div>
                    <p className="text-white">{e.mentor.full_name}</p>
                    <p className="text-gray-500">{new Date(e.session.scheduled_date).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-300">
                      {e.payable_hours}h · {e.currency_snapshot} {e.gross_amount}
                    </p>
                    <p className={`${STATUS_STYLES[e.status]} inline-block px-1.5 py-0.5 rounded mt-0.5`}>{e.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>

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

      <Modal
        open={!!rateTarget}
        onClose={() => setRateTarget(null)}
        title={rateTarget ? `Rate for ${rateTarget.fullName ?? rateTarget.email}` : 'Mentor rate'}
      >
        {rateTarget && (
          <div className="space-y-4">
            <p className="text-gray-400 text-xs">
              Rates are append-only: saving records a new rate from now on and leaves every session already scheduled on the rate
              it was booked under. Final amounts are worked out from the CSV export, not here.
            </p>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Rate Model</label>
              <Select value={rateType} onChange={(v) => setRateType(v as ApiRateType)} options={RATE_TYPE_OPTIONS} />
              <p className="text-[11px] text-gray-500 mt-1">
                {rateType === 'per_hour' && 'Paid per hour of the session’s actual length.'}
                {rateType === 'per_session' && 'A flat fee per session, however long it runs.'}
                {rateType === 'per_team' && 'Paid per team the session covers — a combined session pays more.'}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-400 mb-1 block">Amount{RATE_TYPE_UNITS[rateType]}</label>
                <input
                  type="number"
                  min={1}
                  value={rateAmount}
                  onChange={(e) => setRateAmount(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Currency</label>
                <Select value={rateCurrency} onChange={setRateCurrency} options={CURRENCY_OPTIONS} />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Note (optional)</label>
              <input
                value={rateNote}
                onChange={(e) => setRateNote(e.target.value)}
                placeholder="Why this rate changed"
                className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
              />
            </div>

            {rateHistory.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-1.5">Rate history</p>
                <div className="space-y-1 max-h-[140px] overflow-y-auto scrollbar-thin">
                  {rateHistory.map((r) => (
                    <div key={r.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-1.5">
                      <span className="text-gray-300 text-xs">
                        {describeRate(r)} <span className="text-gray-500">({RATE_TYPE_LABELS[r.rate_type]})</span>
                      </span>
                      <span className="text-gray-500 text-[11px]">{new Date(r.effective_from).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={saveRate}
              disabled={savingRate}
              className="w-full text-sm px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
            >
              {savingRate ? 'Saving...' : 'Save Rate'}
            </button>
          </div>
        )}
      </Modal>
    </PageLayout>
  );
}
