import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Clock, RotateCcw, Upload } from 'lucide-react';
import DataTable from '../../components/DataTable';
import PageLayout from '../../components/PageLayout';
import Select from '../../components/Select';
import { apiListTasks } from '../../lib/api/tasks';
import type { ApiTask, ApiAssignmentStatus } from '../../lib/api/tasks';
import { usePageRefresh } from '../../context/RefreshContext';

type TaskFilter = 'ALL' | 'MISSED' | 'IN_REVIEW' | 'RESUBMIT' | 'COMPLETED' | 'UPCOMING';

function getTaskStatus(task: ApiTask): TaskFilter {
  const status = task.myAssignment?.status;
  const isPastDue = task.deadline ? new Date(task.deadline) < new Date() : false;

  if (status === 'approved') return 'COMPLETED';
  if (status === 'review') return 'IN_REVIEW';
  if (status === 'resubmit') return 'RESUBMIT';
  if (isPastDue) return 'MISSED';
  return 'UPCOMING';
}

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

// Only real, stored assignment statuses — "Missed"/"Upcoming" are derived
// client-side from deadline vs. status, not a column the backend can filter on.
const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'review', label: 'In Review' },
  { value: 'resubmit', label: 'Resubmit' },
  { value: 'approved', label: 'Approved' },
];

export default function StudentTasks({
  onViewSubmission,
  onNewSubmission,
}: {
  onViewSubmission: (taskId: string) => void;
  onNewSubmission: (taskId: string) => void;
}) {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
  // Drives DataTable's own overlay spinner — the list used to swap silently
  // on load/page/search/filter with no feedback at all.
  const [tasksLoading, setTasksLoading] = useState(true);

  const loadTasks = useCallback(() => {
    setTasksLoading(true);
    return apiListTasks({
      page,
      limit,
      search: search || undefined,
      status: statusFilter === 'all' ? undefined : (statusFilter as ApiAssignmentStatus),
    }).then(res => {
      setTasks(Array.isArray(res.data) ? res.data : []);
      setPagination(res.pagination);
    }).catch(console.error).finally(() => setTasksLoading(false));
  }, [page, limit, search, statusFilter]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  usePageRefresh(loadTasks);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearchChange = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  const taskData = useMemo(() => {
    return tasks.map((task) => {
      const status = getTaskStatus(task);
      const myAssignment = task.myAssignment;

      return {
        id: task.id,
        title: task.title,
        description: task.description || '-',
        start_date: task.start_date ? new Date(task.start_date).toLocaleDateString() : '-',
        due_date: task.deadline ? new Date(task.deadline).toLocaleDateString() : '-',
        status,
        category: task.category,
        assignmentId: myAssignment?.id,
        assignmentStatus: myAssignment?.status,
        resubmitCount: myAssignment?.resubmit_count ?? 0,
        maxResubmitCount: myAssignment?.max_resubmit_count ?? 5,
      };
    });
  }, [tasks]);

  // Clicking anywhere on the row does what the action button would do —
  // approved has nothing to act on, so it opens the read-only submission
  // view; pending/resubmit open the same submit popup the button does.
  const handleRowClick = (row: (typeof taskData)[number]) => {
    const canAct = row.assignmentStatus === 'pending' || row.assignmentStatus === 'resubmit';
    if (canAct) {
      onNewSubmission(row.id);
    } else {
      onViewSubmission(row.id);
    }
  };

  return (
    <PageLayout className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">My Tasks</h1>
        <p className="text-gray-400 text-sm mt-1">Track your assigned tasks and identify missed deadlines</p>
      </div>

      <DataTable
        columns={[
          { key: 'title', header: 'Title' },
          { key: 'description', header: 'Description' },
          { key: 'start_date', header: 'Start Date' },
          { key: 'due_date', header: 'Due Date' },
          {
            key: 'status',
            header: 'Status',
            render: (row) => {
              const statusConfig: Record<TaskFilter, { bg: string; text: string; label: string; icon?: React.ReactNode }> = {
                ALL: { bg: '', text: '', label: '' },
                COMPLETED: { bg: 'bg-green-500/10 border-green-500/30', text: 'text-green-400', label: 'Submitted', icon: <CheckCircle2 size={12} /> },
                IN_REVIEW: { bg: 'bg-gold/15 border-gold/30', text: 'text-gold', label: 'In Review', icon: <Clock size={12} /> },
                RESUBMIT: { bg: 'bg-amber-500/10 border-amber-500/30', text: 'text-amber-400', label: 'Resubmit', icon: <RotateCcw size={12} /> },
                MISSED: { bg: 'bg-red-500/10 border-red-500/30', text: 'text-red-400', label: 'Overdue', icon: <AlertTriangle size={12} /> },
                UPCOMING: { bg: 'bg-zinc-800 border-zinc-700', text: 'text-gray-300', label: 'Upcoming' },
              };
              const cfg = statusConfig[row.status as TaskFilter] ?? statusConfig.UPCOMING;
              return (
                <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-semibold ${cfg.bg} ${cfg.text}`}>
                  {cfg.icon}
                  {cfg.label}
                </span>
              );
            },
          },
        ]}
        data={taskData}
        searchPlaceholder="Search tasks..."
        hideExport
        onSearchChange={handleSearchChange}
        onRowClick={handleRowClick}
        leftHeaderContent={
          <Select
            value={statusFilter}
            onChange={(v) => { setPage(1); setStatusFilter(v); }}
            options={STATUS_FILTER_OPTIONS}
            variant="filter"
            className="w-[160px]"
          />
        }
        serverPagination={{
          page: pagination.page,
          limit: pagination.limit,
          total: pagination.total,
          totalPages: pagination.pages,
          onPageChange: setPage,
          onLimitChange: (l) => { setPage(1); setLimit(l); },
        }}
        loading={tasksLoading}
        actions={(row) => {
          const canAct = row.assignmentStatus === 'pending' || row.assignmentStatus === 'resubmit';
          const isResubmit = row.assignmentStatus === 'resubmit';

          if (row.assignmentStatus === 'approved') {
            return (
              <span className="p-1 px-2.5 bg-green-500/10 text-green-400 text-xs font-semibold rounded flex items-center gap-1 border border-green-500/25 w-fit">
                <CheckCircle2 size={13} />
                Approved
              </span>
            );
          }

          // Every task — document, text (general) or link — is submitted from
          // the same popup on the Submissions tab, which shows the right input
          // for the task's category and drives the pending/resubmit -> review
          // transition on submit.
          if (canAct) {
            return (
              <button
                onClick={() => onNewSubmission(row.id)}
                className="p-1 px-2.5 bg-zinc-800 hover:bg-zinc-700 text-gray-300 text-xs font-semibold rounded border border-zinc-700 transition-all flex items-center gap-1"
                title={isResubmit ? 'Resubmit' : 'Submit'}
              >
                <Upload size={13} />
                {isResubmit ? 'Resubmit' : 'Submit'}
              </button>
            );
          }

          return (
            <button
              onClick={() => onViewSubmission(row.id)}
              className="p-1 px-2.5 bg-zinc-800 hover:bg-zinc-700 text-gray-300 text-xs font-semibold rounded border border-zinc-700 transition-all flex items-center gap-1"
              title="View Submission"
            >
              View Submission
            </button>
          );
        }}
      />
    </PageLayout>
  );
}
