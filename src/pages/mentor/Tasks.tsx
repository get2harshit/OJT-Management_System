import { useState, useEffect } from 'react';
import { Plus, Calendar, Inbox, Send, Check, Loader2 } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Drawer from '../../components/Drawer';
import Select from '../../components/Select';
import Button from '../../components/Button';
import {
  apiListTasks,
  apiCreateTask,
  apiUpdateAssignmentStatus,
  apiUpdateSubtaskProgressStatus,
} from '../../lib/api/tasks';
import type { ApiTask, ApiTaskType, ApiAssignment } from '../../lib/api/tasks';
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

type TaskBucket = 'to-me' | 'to-others';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  progress: 'WIP',
  completed: 'Completed',
};

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-gray-500',
  progress: 'bg-yellow-400',
  completed: 'bg-green-400',
};

interface Props {
  mentorId: string;
}

export default function MentorTasks({ mentorId }: Props) {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [bucket, setBucket] = useState<TaskBucket>('to-others');
  const [statusTask, setStatusTask] = useState<ApiTask | null>(null);

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

  // Mirrors the backend's own mentor scoping for GET /tasks (assigned_by_id
  // === me, OR I'm one of the assignees) — just split back into the two
  // halves for the two cards instead of one merged list.
  const assignedToMe = tasks.filter(t => t.assignments?.some(a => a.assignee_id === mentorId));
  const assignedByMe = tasks.filter(t => t.assigned_by_id === mentorId);
  const visibleTasks = bucket === 'to-me' ? assignedToMe : assignedByMe;

  const tableData = visibleTasks.map(t => {
    const myAssignment = t.assignments?.find(a => a.assignee_id === mentorId);
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
      assignedBy: t.assigner?.full_name ?? '-',
      myStatus: myAssignment?.status,
      assignees,
      start_date: t.start_date ? new Date(t.start_date).toLocaleDateString() : '-',
      due_date: t.deadline ? new Date(t.deadline).toLocaleDateString() : '-',
    };
  });

  const toMeColumns = [
    { key: 'title', header: 'Title' },
    { key: 'description', header: 'Description' },
    { key: 'assignedBy', header: 'Assigned By' },
    {
      key: 'myStatus',
      header: 'My Status',
      render: (row: (typeof tableData)[number]) => {
        const status = row.myStatus || 'pending';
        return (
          <span className="text-[10px] bg-zinc-800 text-gray-300 px-2 py-0.5 rounded border border-zinc-700 whitespace-nowrap flex items-center gap-1.5 w-fit">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
            {STATUS_LABEL[status]}
          </span>
        );
      },
    },
    { key: 'due_date', header: 'Due Date' },
  ];

  const toOthersColumns = [
    { key: 'title', header: 'Title' },
    { key: 'description', header: 'Description' },
    {
      key: 'type',
      header: 'Target Role',
      render: (row: (typeof tableData)[number]) => (
        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${row.type === 'Student' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/25' : 'bg-purple-500/10 text-purple-400 border border-purple-500/25'}`}>
          {row.type}
        </span>
      ),
    },
    {
      key: 'assignees',
      header: 'Assigned To',
      render: (row: (typeof tableData)[number]) => (
        <div className="max-w-[250px] flex flex-wrap gap-1.5 py-1">
          {row.assignees.map((a: { name: string; status?: string }, i: number) => (
            <span
              key={i}
              title={a.status ? STATUS_LABEL[a.status] : undefined}
              className="text-[10px] bg-zinc-800 text-gray-300 px-2 py-0.5 rounded border border-zinc-700 whitespace-nowrap flex items-center gap-1"
            >
              {a.status && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[a.status]}`} />}
              {a.name}
            </span>
          ))}
        </div>
      ),
    },
    { key: 'start_date', header: 'Start Date' },
    { key: 'due_date', header: 'Due Date' },
  ];

  const handleRowClick = (row: (typeof tableData)[number]) => {
    if (bucket !== 'to-me') return;
    const task = tasks.find(t => t.id === row.id);
    if (task) setStatusTask(task);
  };

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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => setBucket('to-me')}
          className={`text-left bg-zinc-850 border rounded-xl p-5 transition-all duration-200 ${
            bucket === 'to-me' ? 'border-gold' : 'border-zinc-750 hover:border-zinc-600'
          }`}
        >
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <Inbox size={16} />
            <span className="text-sm">Assigned to Me</span>
          </div>
          <p className="text-2xl font-bold text-white">{assignedToMe.length}</p>
          <p className="text-gray-500 text-xs mt-1">Tasks admin gave you</p>
        </button>

        <button
          onClick={() => setBucket('to-others')}
          className={`text-left bg-zinc-850 border rounded-xl p-5 transition-all duration-200 ${
            bucket === 'to-others' ? 'border-gold' : 'border-zinc-750 hover:border-zinc-600'
          }`}
        >
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <Send size={16} />
            <span className="text-sm">Assigned to Teams/Student</span>
          </div>
          <p className="text-2xl font-bold text-white">{assignedByMe.length}</p>
          <p className="text-gray-500 text-xs mt-1">Tasks you gave your students</p>
        </button>
      </div>

      <DataTable
        columns={bucket === 'to-me' ? toMeColumns : toOthersColumns}
        data={tableData}
        searchPlaceholder="Search tasks..."
        onRowClick={bucket === 'to-me' ? handleRowClick : undefined}
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

      <Drawer open={!!statusTask} onClose={() => setStatusTask(null)} title="Task Status">
        {statusTask && (
          <TaskStatusPanel
            task={statusTask}
            mentorId={mentorId}
            onChanged={async () => {
              await fetchTasksOnly();
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

// Lets the mentor mark their own assignment (or, if the task has subtasks,
// each subtask individually) as WIP/Completed — the approval step admin
// needs from the mentor on tasks admin handed them.
function TaskStatusPanel({
  task,
  mentorId,
  onChanged,
}: {
  task: ApiTask;
  mentorId: string;
  onChanged: () => Promise<void>;
}) {
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const assignment = task.assignments?.find(a => a.assignee_id === mentorId);

  if (!assignment) {
    return <p className="text-gray-500 text-sm">You're not assigned to this task.</p>;
  }

  const subtasks = assignment.subtasks || [];
  const progressFor = (subtaskId: string) =>
    subtasks.find(s => s.id === subtaskId)?.status ?? 'pending';

  const setSubtaskStatus = async (subtaskId: string, status: 'progress' | 'completed') => {
    setSavingKey(subtaskId);
    try {
      await apiUpdateSubtaskProgressStatus(task.id, assignment.id, subtaskId, status);
      await onChanged();
    } finally {
      setSavingKey(null);
    }
  };

  const setTaskStatus = async (status: 'progress' | 'completed') => {
    setSavingKey('__task__');
    try {
      await apiUpdateAssignmentStatus(task.id, assignment.id, status);
      await onChanged();
    } finally {
      setSavingKey(null);
    }
  };

  const completedCount = subtasks.filter(s => progressFor(s.id) === 'completed').length;

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-white font-semibold">{task.title}</h4>
        {task.description && <p className="text-gray-400 text-sm mt-1">{task.description}</p>}
        {task.deadline && (
          <p className="text-gray-500 text-xs mt-2 flex items-center gap-1">
            <Calendar size={12} />
            Due {new Date(task.deadline).toLocaleDateString()}
          </p>
        )}
      </div>

      {subtasks.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h5 className="text-sm font-medium text-gray-300">Subtasks</h5>
            <span className="text-xs text-gray-500">{completedCount}/{subtasks.length} completed</span>
          </div>
          <div className="space-y-2">
            {subtasks.map(subtask => {
              const status = progressFor(subtask.id);
              const saving = savingKey === subtask.id;
              return (
                <div
                  key={subtask.id}
                  className="flex items-center justify-between gap-3 bg-zinc-800/60 border border-zinc-750 rounded-lg px-3 py-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
                    <span className="text-sm text-gray-200 truncate">{subtask.title}</span>
                  </div>
                  <StatusButtons
                    status={status}
                    saving={saving}
                    onMarkWip={() => setSubtaskStatus(subtask.id, 'progress')}
                    onMarkCompleted={() => setSubtaskStatus(subtask.id, 'completed')}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-zinc-800/60 border border-zinc-750 rounded-lg px-3 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[assignment.status]}`} />
            <span className="text-sm text-gray-200">Task status</span>
          </div>
          <StatusButtons
            status={assignment.status}
            saving={savingKey === '__task__'}
            onMarkWip={() => setTaskStatus('progress')}
            onMarkCompleted={() => setTaskStatus('completed')}
          />
        </div>
      )}
    </div>
  );
}

function StatusButtons({
  status,
  saving,
  onMarkWip,
  onMarkCompleted,
}: {
  status: ApiAssignment['status'];
  saving: boolean;
  onMarkWip: () => void;
  onMarkCompleted: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button
        onClick={onMarkWip}
        disabled={saving || status === 'progress'}
        className="text-[10px] font-medium px-2 py-1 rounded border border-yellow-500/30 text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
      >
        {saving ? <Loader2 size={11} className="animate-spin" /> : null}
        WIP
      </button>
      <button
        onClick={onMarkCompleted}
        disabled={saving || status === 'completed'}
        className="text-[10px] font-medium px-2 py-1 rounded border border-green-500/30 text-green-400 bg-green-500/10 hover:bg-green-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
      >
        {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
        Completed
      </button>
    </div>
  );
}
