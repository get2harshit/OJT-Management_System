import { useState, useMemo, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Clock, ListFilter, Eye, Upload } from 'lucide-react';
import DataTable from '../../components/DataTable';
import { apiListTasks } from '../../lib/api/tasks';
import type { ApiTask } from '../../lib/api/tasks';

type TaskFilter = 'ALL' | 'MISSED' | 'IN_PROGRESS' | 'COMPLETED' | 'UPCOMING';

function getTaskStatus(task: ApiTask, studentId: string) {
  const myAssignment = task.assignments?.find(a => a.assignee_id === studentId);
  const status = myAssignment?.status;

  const isPastDue = task.deadline ? new Date(task.deadline) < new Date() : false;

  if (status === 'completed') return 'COMPLETED';
  if (status === 'progress' || status === 'pending') return 'IN_PROGRESS'; // Pending usually means they started but haven't finished, or they just got it.
  if (isPastDue && status !== 'completed') return 'MISSED';
  return 'UPCOMING';
}

export default function StudentTasks({
  studentId,
  onViewSubmission,
  onNewSubmission,
}: {
  studentId: string;
  onViewSubmission: (taskId: string) => void;
  onNewSubmission: (taskId: string) => void;
}) {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [filter, setFilter] = useState<TaskFilter>('ALL');

  useEffect(() => {
    apiListTasks().then(res => setTasks(res.data || [])).catch(console.error);
  }, []);

  const taskData = useMemo(() => {
    return tasks.map((task) => {
      const status = getTaskStatus(task, studentId);
      const myAssignment = task.assignments?.find(a => a.assignee_id === studentId);

      return {
        id: task.id,
        title: task.title,
        description: task.description || '-',
        start_date: '-', 
        due_date: task.deadline ? new Date(task.deadline).toLocaleDateString() : '-',
        status,
        submission_status: myAssignment?.status ? myAssignment.status.toUpperCase() : 'NOT_SUBMITTED',
        version: '-', // Assuming versions are handled in submissions API
      };
    });
  }, [tasks, studentId]);

  const filteredData = useMemo(() => {
    if (filter === 'ALL') return taskData;
    return taskData.filter(t => t.status === filter);
  }, [taskData, filter]);

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
              const color = s === 'COMPLETED' ? 'text-green-400' : s === 'PROGRESS' || s === 'PENDING' ? 'text-yellow-400' : 'text-red-400';
              return <span className={`text-xs font-semibold ${color}`}>{s}</span>;
            },
          },
        ]}
        data={filteredData}
        searchPlaceholder="Search tasks..."
        actions={(row) => {
          if (row.submission_status === 'COMPLETED' || row.submission_status === 'PROGRESS' || row.submission_status === 'PENDING') {
            return (
              <button
                onClick={() => onViewSubmission(row.id)}
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
