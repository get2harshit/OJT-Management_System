import { useState, useEffect, useCallback } from 'react';
import { Wallet } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import DataTable from '../../components/DataTable';
import Select from '../../components/Select';
import { apiGetMyPayouts, type ApiSessionPayout, type ApiPayoutStatus } from '../../lib/api';
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

function formatSessionWhen(session: ApiSessionPayout['session']): string {
  const date = new Date(session.scheduled_date).toLocaleDateString();
  const start = new Date(session.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${start}`;
}

export default function MentorPayouts() {
  const { showError } = useToast();
  const [status, setStatus] = useState('');
  const [payouts, setPayouts] = useState<ApiSessionPayout[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (page = 1, limit = pagination.limit) => {
      setLoading(true);
      try {
        const res = await apiGetMyPayouts({ status: (status as ApiPayoutStatus) || undefined, page, limit });
        setPayouts(res.data);
        setPagination({ page: res.pagination.page, limit: res.pagination.limit, total: res.pagination.total, totalPages: res.pagination.totalPages });
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to load payouts');
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, showError]
  );

  useEffect(() => {
    load(1, pagination.limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const paidCount = payouts.filter((p) => p.status === 'paid').length;
  const pendingCount = payouts.filter((p) => p.status !== 'paid' && p.status !== 'void').length;
  const paidHours = payouts.filter((p) => p.status === 'paid').reduce((sum, p) => sum + Number(p.payable_hours), 0);
  const pendingHours = payouts.filter((p) => p.status !== 'paid' && p.status !== 'void').reduce((sum, p) => sum + Number(p.payable_hours), 0);

  return (
    <PageLayout mode="fill" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Wallet size={24} className="text-gold" />
          My Payouts
        </h1>
        <p className="text-gray-400 text-sm mt-1">Your session payout history (this page only — use filters to scope further)</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Paid (this page)</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{paidCount} session{paidCount === 1 ? '' : 's'}</p>
          <p className="text-xs text-gray-500 mt-0.5">{paidHours.toFixed(1)} hrs</p>
        </div>
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Pending / Approved (this page)</p>
          <p className="text-2xl font-bold text-gold mt-1">{pendingCount} session{pendingCount === 1 ? '' : 's'}</p>
          <p className="text-xs text-gray-500 mt-0.5">{pendingHours.toFixed(1)} hrs</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={status} onChange={setStatus} variant="filter" placeholder="All statuses" className="w-[180px]" options={STATUS_OPTIONS} />
      </div>

      <DataTable
        columns={[
          { key: 'sessionWhen', header: 'Session', render: (row) => formatSessionWhen(row.session) },
          { key: 'duration', header: 'Duration', render: (row) => formatDuration(row.session) },
          { key: 'payable_hours', header: 'Payable Hours' },
          { key: 'status', header: 'Status', render: (row) => (
            <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${STATUS_STYLES[row.status]}`}>{row.status}</span>
          ) },
          { key: 'paid_at', header: 'Paid At', render: (row) => (row.paid_at ? new Date(row.paid_at).toLocaleDateString() : '—') },
        ]}
        data={payouts.map((p) => ({ ...p, sessionWhen: formatSessionWhen(p.session) }))}
        searchPlaceholder="Search payouts..."
        loading={loading}
        hideExport
        serverPagination={{
          page: pagination.page,
          limit: pagination.limit,
          totalPages: pagination.totalPages,
          total: pagination.total,
          onPageChange: (page) => load(page, pagination.limit),
          onLimitChange: (limit) => load(1, limit),
        }}
      />
    </PageLayout>
  );
}
