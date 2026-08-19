import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Inbox, Check, X, Users2 } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import type { Cohort } from '../../lib/types';
import {
  apiListCohorts,
  apiListSessionRequests,
  apiApproveSessionRequest,
  apiRejectSessionRequest,
  type ApiSessionRequest,
  type ApiSessionRequestStatus,
  type ApiSessionRequestType,
} from '../../lib/api';
import { getCohortLabel } from '../../lib/cohortLabel';
import { useToast } from '../../toast';

const STATUS_STYLES: Record<ApiSessionRequestStatus, string> = {
  pending: 'bg-zinc-750 text-gray-300 border border-zinc-700',
  approved: 'bg-green-500/10 text-green-400 border border-green-500/20',
  rejected: 'bg-red-500/10 text-red-400 border border-red-500/20',
  cancelled: 'bg-zinc-750 text-gray-500 border border-zinc-700',
};

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

const TYPE_OPTIONS = [
  { value: 'combined', label: 'Combined' },
  { value: 'on_demand', label: 'On-Demand' },
];

function formatWhen(request: ApiSessionRequest): string {
  const date = new Date(request.proposed_start_time).toLocaleDateString();
  const start = new Date(request.proposed_start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const end = new Date(request.proposed_end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${start} – ${end}`;
}

export default function AdminSessionRequests() {
  const { showSuccess, showError } = useToast();
  const [searchParams] = useSearchParams();

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  // Seeded from a ?cohortId= link (e.g. the OJT Setup Session Requests tab)
  // — the filter itself stays free-standing so "all cohorts" is still one
  // click away, matching Payouts' own pattern.
  const [cohortId, setCohortId] = useState(searchParams.get('cohortId') || '');
  const [status, setStatus] = useState('pending');
  const [requestType, setRequestType] = useState('');

  const [requests, setRequests] = useState<ApiSessionRequest[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  const [rejectTarget, setRejectTarget] = useState<ApiSessionRequest | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [deciding, setDeciding] = useState(false);

  useEffect(() => {
    apiListCohorts()
      .then(setCohorts)
      .catch(() => setCohorts([]));
  }, []);

  const load = useCallback(
    async (page = 1, limit = pagination.limit) => {
      setLoading(true);
      try {
        const res = await apiListSessionRequests({
          cohortId: cohortId || undefined,
          status: (status as ApiSessionRequestStatus) || undefined,
          requestType: (requestType as ApiSessionRequestType) || undefined,
          page,
          limit,
        });
        setRequests(res.data);
        setPagination({ page: res.pagination.page, limit: res.pagination.limit, total: res.pagination.total, totalPages: res.pagination.totalPages });
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to load session requests');
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cohortId, status, requestType, showError]
  );

  useEffect(() => {
    load(1, pagination.limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohortId, status, requestType]);

  // A decided row that no longer matches the active status filter must leave
  // the list rather than sit there updated-but-stale — otherwise it's still
  // clickable under a "Pending" filter after it stopped being pending, which
  // is how a second Approve/Reject on the same row ends up hitting the
  // backend's "already decided" 409 instead of just not being possible.
  const reconcileAfterDecision = (prev: ApiSessionRequest[], updated: ApiSessionRequest) =>
    status && updated.status !== status ? prev.filter((r) => r.id !== updated.id) : prev.map((r) => (r.id === updated.id ? updated : r));

  const approve = async (id: string) => {
    try {
      const updated = await apiApproveSessionRequest(id);
      setRequests((prev) => reconcileAfterDecision(prev, updated));
      showSuccess('Request approved — session scheduled');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to approve request');
    }
  };

  const submitReject = async () => {
    if (!rejectTarget || !rejectNote.trim()) return;
    setDeciding(true);
    try {
      const updated = await apiRejectSessionRequest(rejectTarget.id, rejectNote.trim());
      setRequests((prev) => reconcileAfterDecision(prev, updated));
      showSuccess('Request rejected');
      setRejectTarget(null);
      setRejectNote('');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to reject request');
    } finally {
      setDeciding(false);
    }
  };

  const cohortOptions = useMemo(() => cohorts.map((c) => ({ value: c.id, label: getCohortLabel(c) })), [cohorts]);

  return (
    <PageLayout mode="fill" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Inbox size={24} className="text-gold" />
          Session Requests
        </h1>
        <p className="text-gray-400 text-sm mt-1">Combined and on-demand session requests awaiting a decision</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={cohortId} onChange={setCohortId} variant="filter" placeholder="All cohorts" className="w-[200px]" options={cohortOptions} />
        <Select value={status} onChange={setStatus} variant="filter" placeholder="All statuses" className="w-[160px]" options={STATUS_OPTIONS} />
        <Select value={requestType} onChange={setRequestType} variant="filter" placeholder="All types" className="w-[160px]" options={TYPE_OPTIONS} />
      </div>

      <DataTable
        columns={[
          { key: 'requesterName', header: 'Mentor', render: (row) => row.requester.full_name },
          { key: 'request_type', header: 'Type', render: (row) => (row.request_type === 'on_demand' ? 'On-Demand' : 'Combined') },
          { key: 'proposedWhen', header: 'Proposed', render: (row) => formatWhen(row) },
          { key: 'teams', header: 'Teams', render: (row) => (
            <span className="flex items-center gap-1">
              <Users2 size={12} className="text-gray-500" />
              {row.requested_team_ids.length}
            </span>
          ) },
          { key: 'reason', header: 'Reason' },
          { key: 'status', header: 'Status', render: (row) => (
            <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${STATUS_STYLES[row.status]}`}>{row.status}</span>
          ) },
        ]}
        data={requests.map((r) => ({ ...r, requesterName: r.requester.full_name, proposedWhen: formatWhen(r) }))}
        searchKeys={['requesterName', 'reason']}
        searchPlaceholder="Search by mentor or reason..."
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
        actions={(row) =>
          row.status === 'pending' ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => approve(row.id)}
                className="p-1 px-2.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 text-xs font-semibold rounded transition-all flex items-center gap-1"
              >
                <Check size={14} />
                Approve
              </button>
              <button
                onClick={() => { setRejectTarget(row); setRejectNote(''); }}
                className="p-1 px-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold rounded transition-all flex items-center gap-1"
              >
                <X size={14} />
                Reject
              </button>
            </div>
          ) : row.decision_note ? (
            <span className="text-xs text-gray-500">{row.decision_note}</span>
          ) : null
        }
      />

      <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)} title="Reject Session Request">
        <div className="space-y-4">
          <p className="text-gray-400 text-xs">A decision note is required so the mentor knows why this was rejected.</p>
          <textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            rows={3}
            placeholder="Reason for rejecting..."
            className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold resize-none"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={submitReject}
              disabled={deciding || !rejectNote.trim()}
              className="text-xs px-4 py-2 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              {deciding ? 'Rejecting...' : 'Reject Request'}
            </button>
            <button onClick={() => setRejectTarget(null)} disabled={deciding} className="text-xs px-4 py-2 bg-zinc-750 text-gray-300 font-semibold rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50">
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </PageLayout>
  );
}
