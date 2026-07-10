import { useState, useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Clock, ListFilter, Eye, Upload } from 'lucide-react';
import DataTable from '../../components/DataTable';
import type { Task, Submission } from '../../lib/types';

import { useTasks } from '../../hooks/useTasks';
import { useSubmissions } from '../../hooks/useSubmissions';

interface Props {
  studentId: string;
  tasks: Task[];
  submissions: Submission[];
  onViewSubmission: (submissionId: string) => void;
  onNewSubmission: (taskId: string) => void;
}

type TaskFilter = 'ALL' | 'MISSED' | 'IN_PROGRESS' | 'COMPLETED' | 'UPCOMING';

function getTaskStatus(task: Task, submissions: Submission[], studentId: string) {
  const mySubs = submissions.filter(s => s.task_id === task.id && s.student_id === studentId);
  const hasAccepted = mySubs.some(s => s.status === 'ACCEPTED');
  const hasPendingOrReturned = mySubs.some(s => s.status === 'PENDING' || s.status === 'RETURNED');
  const isPastDue = task.due_date ? new Date(task.due_date) < new Date() : false;

  if (hasAccepted) return 'COMPLETED';
  if (hasPendingOrReturned) return 'IN_PROGRESS';
  if (isPastDue && !hasAccepted) return 'MISSED';
  return 'UPCOMING';
}

export default function StudentTasks({
  studentId,
  tasks: propTasks,
  submissions: propSubmissions,
  onViewSubmission,
  onNewSubmission,
}: Partial<Props> & Pick<Props, 'studentId' | 'onViewSubmission' | 'onNewSubmission'>) {
  const { tasks: hookTasks } = useTasks();
  const { submissions: hookSubmissions } = useSubmissions();

  const tasks = propTasks ?? hookTasks;
  const submissions = propSubmissions ?? hookSubmissions;
  const [filter, setFilter] = useState<TaskFilter>('ALL');

  const taskData = useMemo(() => {
    return tasks.map((task) => {
      const mySubs = submissions.filter(s => s.task_id === task.id && s.student_id === studentId);
      const latestSub = mySubs.length > 0 ? mySubs[mySubs.length - 1] : null;
      const status = getTaskStatus(task, submissions, studentId);

      return {
        id: task.id,
        title: task.title,
        description: task.description ?? '-',
        start_date: task.start_date ?? '-',
        due_date: task.due_date ?? '-',
        status,
        submission_status: latestSub?.status ?? 'NOT_SUBMITTED',
        version: latestSub?.version ?? '-',
      };
    });
  }, [tasks, submissions, studentId]);

  const filteredData = useMemo(() => {
    if (filter === 'ALL') return taskData;
    return taskData.filter(t => t.status === filter);
  }, [taskData, filter]);

  // Progress stats
  const completed = taskData.filter(t => t.status === 'COMPLETED').length;
  const missed = taskData.filter(t => t.status === 'MISSED').length;
  const inProgress = taskData.filter(t => t.status === 'IN_PROGRESS').length;
  const upcoming = taskData.filter(t => t.status === 'UPCOMING').length;
  const total = taskData.length || 1;
  const completedPct = Math.round((completed / total) * 100);
  const missedPct = Math.round((missed / total) * 100);
  const inProgressPct = Math.round((inProgress / total) * 100);

  const filters: { key: TaskFilter; label: string; count: number }[] = [
    { key: 'ALL', label: 'All Tasks', count: taskData.length },
    { key: 'MISSED', label: 'Missed', count: missed },
    { key: 'IN_PROGRESS', label: 'In Progress', count: inProgress },
    { key: 'COMPLETED', label: 'Completed', count: completed },
    { key: 'UPCOMING', label: 'Upcoming', count: upcoming },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">My Tasks</h1>
        <p className="text-gray-400 text-sm mt-1">Track your assigned tasks and identify missed deadlines</p>
      </div>

      {/* Progress Summary Bar */}
      <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Task Progress</h3>
          <span className="text-sm text-gold font-bold">{completedPct}% Complete</span>
        </div>
        <div className="flex h-3 bg-zinc-750 rounded-full overflow-hidden">
          {completedPct > 0 && (
            <div className="bg-green-500 transition-all duration-500" style={{ width: `${completedPct}%` }} title={`Completed: ${completed}`} />
          )}
          {inProgressPct > 0 && (
            <div className="bg-yellow-500 transition-all duration-500" style={{ width: `${inProgressPct}%` }} title={`In Progress: ${inProgress}`} />
          )}
          {missedPct > 0 && (
            <div className="bg-red-500 transition-all duration-500" style={{ width: `${missedPct}%` }} title={`Missed: ${missed}`} />
          )}
        </div>
        <div className="flex gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Completed ({completed})</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> In Progress ({inProgress})</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Missed ({missed})</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-500 inline-block" /> Upcoming ({upcoming})</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex gap-1.5 p-1 bg-zinc-850 border border-zinc-750 rounded-xl w-fit">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              filter === f.key ? 'bg-gold text-black' : 'text-gray-400 hover:text-white'
            }`}
          >
            {f.key === 'ALL' && <ListFilter size={13} />}
            {f.key === 'MISSED' && <AlertTriangle size={13} />}
            {f.key === 'IN_PROGRESS' && <Clock size={13} />}
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
              const statusConfig: Record<string, { bg: string; text: string; label: string; icon?: React.ReactNode }> = {
                COMPLETED: { bg: 'bg-green-500/10 border-green-500/20', text: 'text-green-400', label: 'Completed', icon: <CheckCircle2 size={12} /> },
                IN_PROGRESS: { bg: 'bg-yellow-500/10 border-yellow-500/20', text: 'text-yellow-400', label: 'In Progress', icon: <Clock size={12} /> },
                MISSED: { bg: 'bg-red-500/10 border-red-500/20', text: 'text-red-400', label: 'Missed', icon: <AlertTriangle size={12} /> },
                UPCOMING: { bg: 'bg-gray-500/10 border-gray-500/20', text: 'text-gray-400', label: 'Upcoming' },
              };
              const cfg = statusConfig[row.status as string] ?? statusConfig.UPCOMING;
              return (
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text}`}>
                  {cfg.icon}
                  {cfg.label}
                </span>
              );
            },
          },
          {
            key: 'submission_status',
            header: 'Submission',
            render: (row) => {
              const s = row.submission_status as string;
              if (s === 'NOT_SUBMITTED') return <span className="text-xs text-gray-500">Not Submitted</span>;
              const color = s === 'ACCEPTED' ? 'text-green-400' : s === 'PENDING' ? 'text-yellow-400' : 'text-red-400';
              return <span className={`text-xs font-semibold ${color}`}>{s}</span>;
            },
          },
          { key: 'version', header: 'Version' },
        ]}
        data={filteredData}
        searchPlaceholder="Search tasks..."
        actions={(row) => {
          const mySubs = submissions.filter(s => s.task_id === row.id && s.student_id === studentId);
          const latestSub = mySubs.length > 0 ? mySubs[mySubs.length - 1] : null;

          if (latestSub) {
            return (
              <button
                onClick={() => onViewSubmission(latestSub.id)}
                className="p-1 px-2.5 bg-gold/10 hover:bg-gold/20 text-gold text-xs font-semibold rounded transition-all flex items-center gap-1 border border-gold/25"
                title="View Comments & Discussion"
              >
                <Eye size={13} />
                Comments
              </button>
            );
          } else {
            return (
              <button
                onClick={() => onNewSubmission(row.id)}
                className="p-1 px-2.5 bg-zinc-800 hover:bg-zinc-700 text-gray-300 text-xs font-semibold rounded border border-zinc-700 transition-all flex items-center gap-1"
                title="Submit Deliverable"
              >
                <Upload size={13} />
                Submit
              </button>
            );
          }
        }}
      />
    </div>
  );
}
