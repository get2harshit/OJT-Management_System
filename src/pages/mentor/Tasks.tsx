import { useState, useEffect } from 'react';
import DataTable from '../../components/DataTable';
import { apiListTasks } from '../../lib/api/tasks';
import type { ApiTask } from '../../lib/api/tasks';
import type { Profile } from '../../lib/types';

interface Props {
  mentorId: string;
  profiles: Profile[];
}

export default function MentorTasks({
  mentorId,
  profiles: propProfiles,
}: Partial<Props> & { mentorId: string }) {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [loading, setLoading] = useState(true);

  // Fallback to propProfiles if provided (useful for mock contexts or testing)
  const profiles = propProfiles ?? [];

  useEffect(() => {
    setLoading(true);
    apiListTasks()
      .then(res => setTasks(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const tableData = tasks.map(t => {
    let assignedNames = ['All'];
    if (t.assignments && t.assignments.length > 0) {
      assignedNames = t.assignments.map(a => a.assignee ? a.assignee.full_name : a.assignee_id);
    }
    
    return {
      id: t.id,
      title: t.title,
      description: t.description || '-',
      type: t.target_role === 'student' ? 'Student' : 'Mentor',
      assigned_names: assignedNames,
      start_date: '-', 
      due_date: t.deadline ? new Date(t.deadline).toLocaleDateString() : '-',
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Tasks</h1>
          <p className="text-gray-400 text-sm mt-1">View tasks assigned to you or your students</p>
        </div>
      </div>

      <DataTable
        columns={[
          { key: 'title', header: 'Title' },
          { key: 'description', header: 'Description' },
          {
            key: 'type',
            header: 'Target Role',
            render: (row) => (
              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${row.type === 'Student' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/25' : 'bg-purple-500/10 text-purple-400 border border-purple-500/25'}`}>
                {row.type}
              </span>
            ),
          },
          { 
            key: 'assigned_names', 
            header: 'Assigned To',
            render: (row) => (
              <div className="max-w-[250px] flex flex-wrap gap-1.5 py-1">
                {row.assigned_names.map((name: string, i: number) => (
                  <span key={i} className="text-[10px] bg-zinc-800 text-gray-300 px-2 py-0.5 rounded border border-zinc-700 whitespace-nowrap">
                    {name}
                  </span>
                ))}
              </div>
            )
          },
          { key: 'start_date', header: 'Start Date' },
          { key: 'due_date', header: 'Due Date' },
        ]}
        data={tableData}
        searchPlaceholder="Search tasks..."
      />
    </div>
  );
}
