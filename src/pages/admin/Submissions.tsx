import { Eye, CheckCircle2, RotateCcw } from 'lucide-react';
import DataTable from '../../components/DataTable';
import type { Submission, Task, Profile, Student } from '../../lib/types';

interface Props {
  submissions: Submission[];
  tasks: Task[];
  profiles: Profile[];
  students: Student[];
}

export default function AdminSubmissions({ submissions, tasks, profiles, students }: Props) {
  const data = submissions.map((sub) => {
    const task = tasks.find((t) => t.id === sub.task_id);
    const student = profiles.find((p) => p.id === sub.student_id);
    return {
      ...sub,
      task_title: task?.title ?? '-',
      student_name: student?.name ?? '-',
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Submissions</h1>
        <p className="text-gray-400 text-sm mt-1">Review and manage student submissions</p>
      </div>

      <DataTable
        columns={[
          { key: 'student_name', header: 'Student' },
          { key: 'task_title', header: 'Task' },
          { key: 'file_name', header: 'File' },
          { key: 'version', header: 'Version' },
          {
            key: 'status',
            header: 'Status',
            render: (row) => (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                row.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-400' :
                row.status === 'ACCEPTED' ? 'bg-green-500/10 text-green-400' :
                'bg-red-500/10 text-red-400'
              }`}>
                {row.status}
              </span>
            ),
          },
          { key: 'submitted_at', header: 'Submitted' },
        ]}
        data={data}
        searchPlaceholder="Search submissions..."
        actions={() => (
          <div className="flex items-center gap-2">
            <button className="p-1.5 text-gray-400 hover:text-gold transition-colors" title="View">
              <Eye size={16} />
            </button>
            <button className="p-1.5 text-gray-400 hover:text-green-400 transition-colors" title="Accept">
              <CheckCircle2 size={16} />
            </button>
            <button className="p-1.5 text-gray-400 hover:text-red-400 transition-colors" title="Return">
              <RotateCcw size={16} />
            </button>
          </div>
        )}
      />
    </div>
  );
}
