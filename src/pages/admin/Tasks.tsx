import { useState, useEffect } from 'react';
import { Plus, Trash2, Calendar, CheckSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DataTable from '../../components/DataTable';

import { apiListTasks, apiDeleteTask } from '../../lib/api/tasks';
import type { ApiTask } from '../../lib/api/tasks';
import Button from '../../components/Button';

export default function AdminTasks() {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const navigate = useNavigate();

  const fetchTasksOnly = async () => {
    try {
      const res = await apiListTasks();
      setTasks(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchTasksOnly();
  }, []);

  const handleDelete = async (id: string) => {
    await apiDeleteTask(id);
    fetchTasksOnly();
  };

  const tableData = tasks.map(t => {
    let assignedNames = ['All'];
    if (t.assignments && t.assignments.length > 0) {
      assignedNames = t.assignments.map(a => a.assignee ? a.assignee.full_name : a.assignee_id);
    }
    return { ...t, assigned_names: assignedNames };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Week-wise Goals & Tasks</h1>
          <p className="text-gray-400 text-sm mt-1">Map out structured goals, viva checkpoints, and sub-tasks for each tech stack track</p>
        </div>
        <Button onClick={() => navigate('/admin/dashboard/tasks/create')} leftIcon={<Plus size={18} />} className="hover:scale-105">
          Create Task / Goal
        </Button>
      </div>

      <DataTable
        columns={[
          {
            key: 'week', header: 'Timeline', render: (row) => (
              <span className="text-xs font-bold text-gold flex items-center gap-1">
                <Calendar size={13} />
                {row.week || '-'}
              </span>
            )
          },
          {
            key: 'track', header: 'Tech Stack/Track', render: (row) => (
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-gray-300 font-medium border border-zinc-700">
                {row.track || 'All'}
              </span>
            )
          },
          {
            key: 'title', header: 'Task Title', render: (row) => (
              <div>
                <span className="font-semibold text-white text-sm">{row.title}</span>
              </div>
            )
          },
          {
            key: 'sub_tasks', header: 'Sub-tasks (Checklist)', render: (row) => (
              <div className="max-w-xs space-y-1">
                {row.subtasks && row.subtasks.length > 0 ? (
                  row.subtasks.map((st: { id: string; title: string }, idx: number) => (
                    <div key={idx} className="flex items-center gap-1.5 text-xs text-gray-400">
                      <CheckSquare size={10} className="text-gold shrink-0" />
                      <span className="truncate">{st.title}</span>
                    </div>
                  ))
                ) : (
                  <span className="text-gray-600 text-xs">-</span>
                )}
              </div>
            )
          },
          {
            key: 'target_role',
            header: 'Target',
            render: (row) => (
              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${row.target_role === 'student' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/25' : 'bg-purple-500/10 text-purple-400 border border-purple-500/25'}`}>
                {row.target_role === 'student' ? 'Student' : 'Mentor'}
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
          {
            key: 'deadline', header: 'Deadline', render: (row) => (
              <span className="text-xs text-gray-300 font-mono">
                {row.deadline ? new Date(row.deadline).toLocaleDateString() : '-'}
              </span>
            )
          },
        ]}
        data={tableData}
        searchPlaceholder="Search weekly goals..."
        actions={(row) => (
          <Button variant="ghost" size="sm" onClick={() => handleDelete(row.id)} className="p-1.5 hover:text-red-400">
            <Trash2 size={16} />
          </Button>
        )}
      />
    </div>
  );
}
