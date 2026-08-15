import { useState, useEffect, useCallback } from 'react';
import { CalendarCheck } from 'lucide-react';
import DataTable from '../../components/DataTable';
import PageLayout from '../../components/PageLayout';
import { apiGetMyAttendance, type ApiMyAttendanceRow, type ApiAttendanceStatus } from '../../lib/api';
import { useToast } from '../../toast';
import { formatInIST } from '../../lib/utils';
import { usePageRefresh } from '../../context/RefreshContext';

const STATUS_STYLES: Record<ApiAttendanceStatus, string> = {
  not_marked: 'bg-zinc-750 text-gray-400 border-zinc-650',
  present: 'bg-green-500/10 text-green-400 border-green-500/20',
  absent: 'bg-red-500/10 text-red-400 border-red-500/20',
  excused: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

export default function StudentAttendance() {
  const { showError } = useToast();
  const [rows, setRows] = useState<ApiMyAttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGetMyAttendance({ page, limit });
      setRows(res.data);
      setTotal(res.pagination.total);
      setTotalPages(res.pagination.totalPages);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load attendance');
    } finally {
      setLoading(false);
    }
  }, [page, limit, showError]);

  useEffect(() => {
    load();
  }, [load]);

  usePageRefresh(load);

  const presentCount = rows.filter((r) => r.status === 'present').length;

  return (
    <PageLayout className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">My Attendance</h1>
          <p className="text-gray-400 text-sm mt-1">Your attendance across every mentor session</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 text-green-400 rounded-lg text-sm font-medium">
          <CalendarCheck size={16} />
          {presentCount} Present (this page)
        </div>
      </div>

      <DataTable
        columns={[
          { key: 'mentor', header: 'Mentor', render: (row) => row.session.mentor.full_name },
          {
            key: 'scheduled_date',
            header: 'When',
            // Always IST — a student's own local browser zone is irrelevant here.
            render: (row) => `${formatInIST(row.session.start_time)} — ${formatInIST(row.session.end_time, { hour: '2-digit', minute: '2-digit' })}`,
          },
          {
            key: 'status',
            header: 'Status',
            render: (row) => (
              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${STATUS_STYLES[row.status]}`}>{row.status.replace('_', ' ')}</span>
            ),
          },
          { key: 'hours_credited', header: 'Hours', render: (row) => (row.hours_credited ? `${row.hours_credited}h` : '—') },
        ]}
        data={rows}
        loading={loading}
        hideExport
        searchPlaceholder="Search..."
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
