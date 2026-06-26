import DataTable from '../../components/DataTable';
import type { Task, Submission } from '../../lib/types';

interface Props {
  studentId: string;
  tasks: Task[];
  submissions: Submission[];
}

export default function StudentTasks({ studentId, tasks, submissions }: Props) {
  const data = tasks.map((task) => {
    const sub = submissions.find((s) => s.task_id === task.id && s.student_id === studentId);
    return {
      id: task.id,
      title: task.title,
      description: task.description ?? '-',
      due_date: task.due_date ?? '-',
      status: sub?.status ?? 'NOT_SUBMITTED',
      version: sub?.version ?? '-',
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">My Tasks</h1>
        <p className="text-gray-400 text-sm mt-1">View and track your assigned tasks</p>
      </div>

      <DataTable
        columns={[
          { key: 'title', header: 'Title' },
          { key: 'description', header: 'Description' },
          { key: 'due_date', header: 'Due Date' },
          {
            key: 'status',
            header: 'Status',
            render: (row) => {
              const status = row.status;
              const color =
                status === 'ACCEPTED' ? 'bg-green-500/10 text-green-400' :
                status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-400' :
                status === 'RETURNED' ? 'bg-red-500/10 text-red-400' :
                'bg-gray-500/10 text-gray-400';
              const label = status === 'NOT_SUBMITTED' ? 'Not Submitted' : status;
              return (
                <span className={`text-xs px-2 py-0.5 rounded-full ${color}`}>
                  {label}
                </span>
              );
            },
          },
          { key: 'version', header: 'Version' },
        ]}
        data={data}
        searchPlaceholder="Search tasks..."
      />
    </div>
  );
}
