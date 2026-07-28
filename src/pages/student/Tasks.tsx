import { useState, useMemo, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, Clock, ListFilter, RotateCcw, Upload } from 'lucide-react';
import DataTable from '../../components/DataTable';
import { apiListTasks } from '../../lib/api/tasks';
import type { ApiTask } from '../../lib/api/tasks';

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

export default function StudentTasks({
  onViewSubmission,
  onNewSubmission,
}: {
  onViewSubmission: (taskId: string) => void;
  onNewSubmission: (taskId: string) => void;
}) {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [filter, setFilter] = useState<TaskFilter>('ALL');

  const loadTasks = useCallback(() => {
    return apiListTasks().then(res => {
      const t = Array.isArray(res) ? res : (res?.data || []);
      setTasks(Array.isArray(t) ? t : []);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

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

  const filteredData = useMemo(() => {
    if (filter === 'ALL') return taskData;
    return taskData.filter(t => t.status === filter);
  }, [taskData, filter]);

  const completed = taskData.filter(t => t.status === 'COMPLETED').length;
  const missed = taskData.filter(t => t.status === 'MISSED').length;
  const inReview = taskData.filter(t => t.status === 'IN_REVIEW').length;
  const resubmit = taskData.filter(t => t.status === 'RESUBMIT').length;
  const upcoming = taskData.filter(t => t.status === 'UPCOMING').length;
  const total = taskData.length || 1;
  const completedPct = Math.round((completed / total) * 100);
  const missedPct = Math.round((missed / total) * 100);
  const activePct = Math.round(((inReview + resubmit) / total) * 100);

  const filters: { key: TaskFilter; label: string; count: number }[] = [
    { key: 'ALL', label: 'All Tasks', count: taskData.length },
    { key: 'MISSED', label: 'Missed', count: missed },
    { key: 'RESUBMIT', label: 'Resubmit', count: resubmit },
    { key: 'IN_REVIEW', label: 'In Review', count: inReview },
    { key: 'COMPLETED', label: 'Completed', count: completed },
    { key: 'UPCOMING', label: 'Upcoming', count: upcoming },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">My Tasks</h1>
        <p className="text-gray-400 text-sm mt-1">Track your assigned tasks and identify missed deadlines</p>
      </div>

      <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Task Progress</h3>
          <span className="text-sm text-gold font-bold">{completedPct}% Approved</span>
        </div>
        <div className="flex h-3 bg-zinc-750 rounded-full overflow-hidden">
          {completedPct > 0 && (
            <div className="bg-green-500 transition-all duration-500" style={{ width: `${completedPct}%` }} title={`Approved: ${completed}`} />
          )}
          {activePct > 0 && (
            <div className="bg-yellow-500 transition-all duration-500" style={{ width: `${activePct}%` }} title={`In review/resubmit: ${inReview + resubmit}`} />
          )}
          {missedPct > 0 && (
            <div className="bg-red-500 transition-all duration-500" style={{ width: `${missedPct}%` }} title={`Missed: ${missed}`} />
          )}
        </div>
        <div className="flex gap-4 text-xs text-gray-400 flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Approved ({completed})</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> In Review ({inReview})</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> Resubmit ({resubmit})</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Missed ({missed})</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-500 inline-block" /> Upcoming ({upcoming})</span>
        </div>
      </div>

      <div className="flex gap-1.5 p-1 bg-zinc-850 border border-zinc-750 rounded-xl w-full sm:w-fit overflow-x-auto">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              filter === f.key ? 'bg-gold text-black' : 'text-gray-400 hover:text-white'
            }`}
          >
            {f.key === 'ALL' && <ListFilter size={13} />}
            {f.key === 'MISSED' && <AlertTriangle size={13} />}
            {f.key === 'RESUBMIT' && <RotateCcw size={13} />}
            {f.key === 'IN_REVIEW' && <Clock size={13} />}
            {f.key === 'COMPLETED' && <CheckCircle2 size={13} />}
            {f.label} ({f.count})
          </button>
        ))}
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
                COMPLETED: { bg: 'bg-green-500/10 border-green-500/20', text: 'text-green-400', label: 'Approved', icon: <CheckCircle2 size={12} /> },
                IN_REVIEW: { bg: 'bg-yellow-500/10 border-yellow-500/20', text: 'text-yellow-400', label: 'In Review', icon: <Clock size={12} /> },
                RESUBMIT: { bg: 'bg-orange-500/10 border-orange-500/20', text: 'text-orange-400', label: 'Resubmit', icon: <RotateCcw size={12} /> },
                MISSED: { bg: 'bg-red-500/10 border-red-500/20', text: 'text-red-400', label: 'Missed', icon: <AlertTriangle size={12} /> },
                UPCOMING: { bg: 'bg-gray-500/10 border-gray-500/20', text: 'text-gray-400', label: 'Upcoming' },
              };
              const cfg = statusConfig[row.status as TaskFilter] ?? statusConfig.UPCOMING;
              return (
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text}`}>
                  {cfg.icon}
                  {cfg.label}
                </span>
              );
            },
          },
        ]}
        data={filteredData}
        searchPlaceholder="Search tasks..."
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
    </div>
  );
}
