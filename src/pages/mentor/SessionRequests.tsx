import { useState, useEffect, useCallback, useMemo } from 'react';
import { Inbox, Plus, XCircle } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import type { Cohort, TeamWithProject, ApiMentor } from '../../lib/types';
import {
  apiListMyCohorts,
  apiListMyTeamsDetailed,
  apiListMentorsPage,
  apiGetMySessionRequests,
  apiCreateSessionRequest,
  apiCancelSessionRequest,
  type ApiSessionRequest,
  type ApiSessionRequestStatus,
  type ApiSessionRequestType,
} from '../../lib/api';
import { getCohortLabel } from '../../lib/cohortLabel';
import { useToast } from '../../toast';
import { useAuth } from '../../context/useAuth';

const STATUS_STYLES: Record<ApiSessionRequestStatus, string> = {
  pending: 'bg-zinc-750 text-gray-300 border border-zinc-700',
  approved: 'bg-green-500/10 text-green-400 border border-green-500/20',
  rejected: 'bg-red-500/10 text-red-400 border border-red-500/20',
  cancelled: 'bg-zinc-750 text-gray-500 border border-zinc-700',
};

const TYPE_OPTIONS = [
  { value: 'combined', label: 'Combined (multiple teams, one session)' },
  { value: 'on_demand', label: 'On-Demand (outside the usual schedule)' },
];

function formatWhen(request: ApiSessionRequest): string {
  const date = new Date(request.proposed_start_time).toLocaleDateString();
  const start = new Date(request.proposed_start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const end = new Date(request.proposed_end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${start} – ${end}`;
}

interface RequestFormState {
  requestType: ApiSessionRequestType;
  teamIds: string[];
  coMentorIds: string[];
  startLocal: string;
  endLocal: string;
  reason: string;
}

const EMPTY_FORM: RequestFormState = { requestType: 'combined', teamIds: [], coMentorIds: [], startLocal: '', endLocal: '', reason: '' };

export default function MentorSessionRequests() {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortId, setCohortId] = useState('');
  const [teams, setTeams] = useState<TeamWithProject[]>([]);
  const [mentors, setMentors] = useState<ApiMentor[]>([]);

  const [requests, setRequests] = useState<ApiSessionRequest[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<RequestFormState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiListMyCohorts()
      .then(setCohorts)
      .catch(() => setCohorts([]));
    apiListMyTeamsDetailed()
      .then(setTeams)
      .catch(() => setTeams([]));
  }, []);

  useEffect(() => {
    if (cohorts.length === 0) return;
    setCohortId((prev) => prev || cohorts.find((c) => c.isActive)?.id || cohorts[0]?.id || prev);
  }, [cohorts]);

  useEffect(() => {
    if (!cohortId) return;
    apiListMentorsPage({ page: 1, limit: 200, cohortId })
      .then((res) => setMentors(res.data.filter((m) => m.id !== user?.id)))
      .catch(() => setMentors([]));
  }, [cohortId, user]);

  const load = useCallback(
    async (page = 1, limit = pagination.limit) => {
      setLoading(true);
      try {
        const res = await apiGetMySessionRequests({ cohortId: cohortId || undefined, page, limit });
        setRequests(res.data);
        setPagination({ page: res.pagination.page, limit: res.pagination.limit, total: res.pagination.total, totalPages: res.pagination.totalPages });
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to load your session requests');
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cohortId, showError]
  );

  useEffect(() => {
    load(1, pagination.limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohortId]);

  const cohortTeams = useMemo(() => teams.filter((t) => t.cohortId === cohortId), [teams, cohortId]);
  const teamOptions = useMemo(
    () => cohortTeams.map((t) => ({ value: t.teamId, label: t.members.map((m) => m.fullName ?? m.studentId).join(', ') || t.name || 'Team' })),
    [cohortTeams]
  );
  // Both fullName and email are optional on ApiMentor, so the id is the last
  // resort — same fallback teamOptions above uses. An option with no label at
  // all renders as a blank row you can still select, which is worse than a
  // readable-but-ugly one.
  const mentorOptions = useMemo(
    () => mentors.map((m) => ({ value: m.id, label: m.fullName ?? m.email ?? m.id })),
    [mentors]
  );

  const submitRequest = async () => {
    if (!form || !cohortId) return;
    if (form.teamIds.length === 0 || !form.startLocal || !form.endLocal || !form.reason.trim()) {
      showError('Team(s), a time range, and a reason are all required');
      return;
    }
    setSubmitting(true);
    try {
      const start = new Date(form.startLocal);
      const end = new Date(form.endLocal);
      await apiCreateSessionRequest({
        cohortId,
        requestType: form.requestType,
        proposedDate: start.toISOString().slice(0, 10),
        proposedStartTime: start.toISOString(),
        proposedEndTime: end.toISOString(),
        reason: form.reason.trim(),
        teamIds: form.teamIds,
        coMentorIds: form.requestType === 'combined' ? form.coMentorIds : undefined,
      });
      showSuccess('Session request submitted — awaiting admin decision');
      setForm(null);
      load(1, pagination.limit);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async (id: string) => {
    try {
      const updated = await apiCancelSessionRequest(id);
      setRequests((prev) => prev.map((r) => (r.id === id ? updated : r)));
      showSuccess('Request cancelled');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to cancel request');
    }
  };

  return (
    <PageLayout mode="fill" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Inbox size={24} className="text-gold" />
            Session Requests
          </h1>
          <p className="text-gray-400 text-sm mt-1">Request a combined or on-demand session for admin approval</p>
        </div>
        <div className="flex items-center gap-2.5">
          <Select value={cohortId} onChange={setCohortId} variant="filter" placeholder="Select cohort" className="w-[200px]" options={cohorts.map((c) => ({ value: c.id, label: getCohortLabel(c) }))} />
          <button
            onClick={() => setForm({ ...EMPTY_FORM })}
            disabled={!cohortId}
            className="flex items-center gap-1.5 text-xs px-3 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-40"
          >
            <Plus size={14} />
            New Request
          </button>
        </div>
      </div>

      <DataTable
        columns={[
          { key: 'request_type', header: 'Type', render: (row) => (row.request_type === 'on_demand' ? 'On-Demand' : 'Combined') },
          { key: 'proposedWhen', header: 'Proposed', render: (row) => formatWhen(row) },
          { key: 'reason', header: 'Reason' },
          { key: 'status', header: 'Status', render: (row) => (
            <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${STATUS_STYLES[row.status]}`}>{row.status}</span>
          ) },
          { key: 'decision_note', header: 'Decision Note', render: (row) => row.decision_note ?? '—' },
        ]}
        data={requests.map((r) => ({ ...r, proposedWhen: formatWhen(r) }))}
        searchPlaceholder="Search your requests..."
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
            <button
              onClick={() => cancel(row.id)}
              className="p-1 px-2.5 bg-zinc-750 hover:bg-zinc-700 text-gray-300 text-xs font-semibold rounded transition-all flex items-center gap-1"
            >
              <XCircle size={14} />
              Withdraw
            </button>
          ) : null
        }
      />

      <Modal open={!!form} onClose={() => setForm(null)} title="New Session Request" size="lg">
        {form && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Request Type</label>
              <Select value={form.requestType} onChange={(v) => setForm({ ...form, requestType: v as ApiSessionRequestType })} options={TYPE_OPTIONS} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Team(s)</label>
              <Select isMulti value={form.teamIds} onChange={(v) => setForm({ ...form, teamIds: v })} options={teamOptions} placeholder="Select team(s)" isSearchable />
            </div>
            {form.requestType === 'combined' && (
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Co-Mentor(s) (optional)</label>
                <Select isMulti value={form.coMentorIds} onChange={(v) => setForm({ ...form, coMentorIds: v })} options={mentorOptions} placeholder="Select co-mentor(s)" isSearchable />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Proposed Start</label>
                <input type="datetime-local" value={form.startLocal} onChange={(e) => setForm({ ...form, startLocal: e.target.value })} className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Proposed End</label>
                <input type="datetime-local" value={form.endLocal} onChange={(e) => setForm({ ...form, endLocal: e.target.value })} className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Reason</label>
              <textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                rows={3}
                placeholder="Why this session is needed..."
                className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold resize-none"
              />
            </div>
            <div className="flex items-center gap-2 border-t border-zinc-800 pt-4">
              <button onClick={submitRequest} disabled={submitting} className="text-xs px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50">
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
              <button onClick={() => setForm(null)} disabled={submitting} className="text-xs px-4 py-2 bg-zinc-750 text-gray-300 font-semibold rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50">
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>
    </PageLayout>
  );
}
