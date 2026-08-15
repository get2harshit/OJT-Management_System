import { useState, useEffect, useCallback } from 'react';
import { CalendarClock } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import DataTable from '../../components/DataTable';
import SessionJoinLink from '../../components/SessionJoinLink';
import { apiGetMyUpcomingSessions, type ApiSession, type ApiSessionStatus } from '../../lib/api';
import { useToast } from '../../toast';
import { formatInIST } from '../../lib/utils';
import { usePageRefresh } from '../../context/RefreshContext';

const STATUS_STYLES: Record<ApiSessionStatus, string> = {
  scheduled: 'bg-gold/10 text-gold border-gold/20',
  rescheduled: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  completed: 'bg-green-500/10 text-green-400 border-green-500/20',
  cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export default function StudentSessions() {
  const { showError } = useToast();
  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGetMyUpcomingSessions({ page, limit });
      setSessions(res.data);
      setTotal(res.pagination.total);
      setTotalPages(res.pagination.totalPages);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [page, limit, showError]);

  useEffect(() => {
    load();
  }, [load]);

  usePageRefresh(load);

  return (
    <PageLayout className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <CalendarClock size={24} className="text-gold" />
          My Sessions
        </h1>
        <p className="text-gray-400 text-sm mt-1">Sessions scheduled with your mentor.</p>
      </div>

      <DataTable
        columns={[
          { key: 'mentor', header: 'Mentor', render: (row) => row.mentor.full_name },
          { key: 'title', header: 'Title', render: (row) => row.title || row.teams.map((t) => t.team.name).join(', ') || '—' },
          {
            key: 'start_time',
            header: 'When',
            // Always IST — a student's own local browser zone is irrelevant here.
            render: (row) => `${formatInIST(row.start_time)} — ${formatInIST(row.end_time, { hour: '2-digit', minute: '2-digit' })}`,
          },
          {
            key: 'location_or_link',
            header: 'Location',
            render: (row) => (
              <SessionJoinLink
                locationOrLink={row.location_or_link}
                startTime={row.start_time}
                endTime={row.end_time}
                status={row.status}
                variant="cell"
              />
            ),
          },
          {
            key: 'status',
            header: 'Status',
            render: (row) => (
              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${STATUS_STYLES[row.status]}`}>{row.status}</span>
            ),
          },
        ]}
        data={sessions}
        loading={loading}
        hideExport
        serverPagination={{
          page,
          limit,
          total,
          totalPages,
          onPageChange: setPage,
          onLimitChange: (l) => {
            setLimit(l);
            setPage(1);
          },
        }}
      />
    </PageLayout>
  );
}
