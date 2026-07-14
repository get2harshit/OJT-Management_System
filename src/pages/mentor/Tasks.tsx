import { useState, useEffect } from 'react';
import { Plus, Calendar } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Drawer from '../../components/Drawer';
import Select from '../../components/Select';
import Button from '../../components/Button';
import { apiListTasks, apiCreateTask } from '../../lib/api/tasks';
import type { ApiTask, ApiTaskType } from '../../lib/api/tasks';
import { apiListMyTeams } from '../../lib/api/teams';
import type { Team } from '../../lib/types';

const TASK_TYPE_OPTIONS: { value: ApiTaskType; label: string }[] = [
  { value: 'prd', label: 'PRD' },
  { value: 'hld', label: 'HLD' },
  { value: 'lld', label: 'LLD' },
  { value: 'db_schema', label: 'DB Schema' },
  { value: 'api_contract', label: 'API Contract' },
  { value: 'others', label: 'Others' },
];

const EMPTY_FORM = {
  title: '',
  description: '',
  taskType: 'prd' as ApiTaskType,
  assignMode: 'team' as 'team' | 'individual',
  teamIds: [] as string[],
  assignees: [] as string[],
  startDate: '',
  dueDate: '',
};

export default function MentorTasks() {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const fetchTasksOnly = async () => {
    try {
      const res = await apiListTasks();
      setTasks(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    Promise.all([apiListTasks(), apiListMyTeams()])
      .then(([tasksRes, teamsRes]) => {
        setTasks(tasksRes.data || []);
        setMyTeams(teamsRes);
      })
      .catch(console.error);
  }, []);

  const teamOptions = myTeams.map(team => ({
    value: team.id,
    label: team.members.map(m => m.fullName || 'Unnamed').join(', ') || team.track,
  }));

  const studentOptions = Array.from(
    new Map(myTeams.flatMap(t => t.members).map(m => [m.studentId, m])).values()
  ).map(m => ({ value: m.studentId, label: m.fullName || m.studentId }));

  const canSave =
    !!form.title &&
    (form.assignMode === 'team' ? form.teamIds.length > 0 : form.assignees.length > 0);

  const handleSave = async () => {
    if (!canSave) return;

    await apiCreateTask({
      title: form.title,
      description: form.description || undefined,
      targetRole: 'student',
      taskType: form.taskType,
      assignMode: form.assignMode,
      teamIds: form.assignMode === 'team' ? form.teamIds : undefined,
      assignees: form.assignMode === 'individual' ? form.assignees : undefined,
      startDate: form.startDate ? new Date(form.startDate).toISOString() : undefined,
      deadline: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
    });

    setForm(EMPTY_FORM);
    setDrawerOpen(false);
    fetchTasksOnly();
  };

  const tableData = tasks.map(t => {
    const assignees = (t.assignments && t.assignments.length > 0)
      ? t.assignments.map(a => ({
        name: a.assignee ? a.assignee.full_name : a.assignee_id,
        status: a.status,
      }))
      : [{ name: 'All', status: undefined as string | undefined }];

    return {
      id: t.id,
      title: t.title,
      description: t.description || '-',
      type: t.target_role === 'student' ? 'Student' : 'Mentor',
      assignees,
      start_date: t.start_date ? new Date(t.start_date).toLocaleDateString() : '-',
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
        <Button onClick={() => setDrawerOpen(true)} leftIcon={<Plus size={18} />} className="hover:scale-105">
          Create Task
        </Button>
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
            key: 'assignees',
            header: 'Assigned To',
            render: (row) => (
              <div className="max-w-[250px] flex flex-wrap gap-1.5 py-1">
                {row.assignees.map((a: { name: string; status?: string }, i: number) => {
                  const dotColor = a.status === 'completed' ? 'bg-green-400' : a.status === 'progress' ? 'bg-yellow-400' : 'bg-gray-500';
                  return (
                    <span
                      key={i}
                      title={a.status ? `${a.status[0].toUpperCase()}${a.status.slice(1)}` : undefined}
                      className="text-[10px] bg-zinc-800 text-gray-300 px-2 py-0.5 rounded border border-zinc-700 whitespace-nowrap flex items-center gap-1"
                    >
                      {a.status && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />}
                      {a.name}
                    </span>
                  );
                })}
              </div>
            )
          },
          { key: 'start_date', header: 'Start Date' },
          { key: 'due_date', header: 'Due Date' },
        ]}
        data={tableData}
        searchPlaceholder="Search tasks..."
      />

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Create Task">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Assign To</label>
            <div className="flex gap-2">
              <Button
                variant={form.assignMode === 'team' ? 'blue' : 'secondary'}
                onClick={() => setForm({ ...form, assignMode: 'team', assignees: [] })}
                className="flex-1"
              >
                Team
              </Button>
              <Button
                variant={form.assignMode === 'individual' ? 'blue' : 'secondary'}
                onClick={() => setForm({ ...form, assignMode: 'individual', teamIds: [] })}
                className="flex-1"
              >
                Individual
              </Button>
            </div>
          </div>

          {form.assignMode === 'team' ? (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Select Teams</label>
              <Select
                isMulti
                isSearchable
                value={form.teamIds}
                onChange={v => setForm({ ...form, teamIds: v })}
                placeholder="Select team(s)..."
                options={teamOptions}
                className="w-full"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Select Students</label>
              <Select
                isMulti
                isSearchable
                value={form.assignees}
                onChange={v => setForm({ ...form, assignees: v })}
                placeholder="Select student(s)..."
                options={studentOptions}
                className="w-full"
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Task Type</label>
            <Select
              value={form.taskType}
              onChange={v => setForm({ ...form, taskType: v as ApiTaskType })}
              options={TASK_TYPE_OPTIONS}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Task Title</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="e.g., Submit Wireframes"
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Description (optional)</label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Describe expectations or provide reference links..."
              rows={3}
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold transition-colors resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1 flex items-center gap-1">
                <Calendar size={14} className="text-gold" />
                Start Date
              </label>
              <input
                type="date"
                style={{ colorScheme: 'dark' }}
                value={form.startDate}
                onChange={e => setForm({ ...form, startDate: e.target.value })}
                className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold transition-colors cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1 flex items-center gap-1">
                <Calendar size={14} className="text-gold" />
                End Date
              </label>
              <input
                type="date"
                style={{ colorScheme: 'dark' }}
                value={form.dueDate}
                onChange={e => setForm({ ...form, dueDate: e.target.value })}
                className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold transition-colors cursor-pointer"
              />
            </div>
          </div>

          <Button onClick={handleSave} disabled={!canSave} fullWidth size="lg">
            Create Task
          </Button>
        </div>
      </Drawer>
    </div>
  );
}
