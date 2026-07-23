import { useState, useEffect } from 'react';
import { Plus, Calendar, Inbox, Send, Loader2 } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Drawer from '../../components/Drawer';
import Select from '../../components/Select';
import Button from '../../components/Button';
import {
  apiListTasks,
  apiCreateTask,
  apiSubmitTask,
  apiResubmitTask,
  apiApproveTask,
  apiRequestResubmit,
} from '../../lib/api/tasks';
import type { ApiTask, ApiTaskType, ApiTaskCategory, ApiAssignment, ApiAssignmentStatus } from '../../lib/api/tasks';
import { apiListMyTeams } from '../../lib/api/teams';
import { apiListMyCohorts } from '../../lib/api/cohorts';
import type { Team } from '../../lib/types';
import { TRACKS } from '../../lib/constants';
import { useToast } from '../../toast';

const TASK_TYPE_OPTIONS: { value: ApiTaskType; label: string }[] = [
  { value: 'prd', label: 'PRD' },
  { value: 'hld', label: 'HLD' },
  { value: 'lld', label: 'LLD' },
  { value: 'db_schema', label: 'DB Schema' },
  { value: 'api_contract', label: 'API Contract' },
  { value: 'others', label: 'Others' },
];

const CATEGORY_OPTIONS: { value: ApiTaskCategory; label: string }[] = [
  { value: 'document_submission', label: 'Document Submission' },
  { value: 'general', label: 'General (no submission)' },
  { value: 'link_submission', label: 'Link Submission' },
];

const WEEKS = Array.from({ length: 12 }, (_, i) => String(i + 1));

const EMPTY_FORM = {
  title: '',
  description: '',
  taskType: 'prd' as ApiTaskType,
  category: 'document_submission' as ApiTaskCategory,
  assignMode: 'team' as 'team' | 'individual',
  teamIds: [] as string[],
  assignees: [] as string[],
  week: '1',
  track: '',
  startDate: '',
  dueDate: '',
};

type TaskBucket = 'to-me' | 'to-others';

const STATUS_LABEL: Record<ApiAssignmentStatus, string> = {
  pending: 'Pending',
  review: 'In Review',
  resubmit: 'Resubmit',
  approved: 'Approved',
};

const STATUS_DOT: Record<ApiAssignmentStatus, string> = {
  pending: 'bg-gray-500',
  review: 'bg-blue-400',
  resubmit: 'bg-orange-400',
  approved: 'bg-green-400',
};

interface Props {
  mentorId: string;
}

export default function MentorTasks({ mentorId }: Props) {
  const { showSuccess, showError } = useToast();
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [publishedCohortIds, setPublishedCohortIds] = useState<Set<string>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [bucket, setBucket] = useState<TaskBucket>('to-others');
  const [statusTask, setStatusTask] = useState<ApiTask | null>(null);
  const [reviewTask, setReviewTask] = useState<ApiTask | null>(null);

  const fetchTasksOnly = async () => {
    try {
      const res = await apiListTasks();
      setTasks(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    Promise.all([apiListTasks(), apiListMyTeams(), apiListMyCohorts()])
      .then(([tasksRes, teamsRes, cohortsRes]) => {
        setTasks(tasksRes.data || []);
        setMyTeams(teamsRes);
        setPublishedCohortIds(new Set(cohortsRes.filter(c => c.allocationRunStatus === 'published').map(c => c.id)));
      })
      .catch(console.error);
  }, []);

  // A student can't be assigned a task before their team's project
  // allocation is published — same rule the backend now enforces, applied
  // here too so the picker doesn't offer a team/student who'd just be
  // silently dropped on save.
  const publishedTeams = myTeams.filter(team => !!team.cohortId && publishedCohortIds.has(team.cohortId));
  const unpublishedTeamCount = myTeams.length - publishedTeams.length;

  const teamOptions = publishedTeams.map(team => ({
    value: team.id,
    label: team.members.map(m => m.fullName || 'Unnamed').join(', ') || team.track,
  }));

  const studentOptions = Array.from(
    new Map(publishedTeams.flatMap(t => t.members).map(m => [m.studentId, m])).values()
  ).map(m => ({ value: m.studentId, label: m.fullName || m.studentId }));

  const canSave =
    !!form.title &&
    !!form.track &&
    !!form.startDate &&
    !!form.dueDate &&
    new Date(form.startDate) < new Date(form.dueDate) &&
    (form.assignMode === 'team' ? form.teamIds.length > 0 : form.assignees.length > 0);

  const [savingTask, setSavingTask] = useState(false);

  const handleSave = async () => {
    if (!canSave) return;

    setSavingTask(true);
    try {
      await apiCreateTask({
        title: form.title,
        description: form.description || undefined,
        target_role: 'student',
        task_type: form.taskType,
        category: form.category,
        assign_mode: form.assignMode,
        teamIds: form.assignMode === 'team' ? form.teamIds : undefined,
        assignees: form.assignMode === 'individual' ? form.assignees : undefined,
        start_date: new Date(form.startDate).toISOString(),
        deadline: new Date(form.dueDate).toISOString(),
        week: `Week ${form.week}`,
        track: form.track,
      });

      setForm(EMPTY_FORM);
      setDrawerOpen(false);
      showSuccess('Task created successfully');
      await fetchTasksOnly();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setSavingTask(false);
    }
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
      : [{ name: 'All', status: undefined as ApiAssignmentStatus | undefined }];

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
          {row.assignees.map((a: { name: string; status?: ApiAssignmentStatus }, i: number) => (
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
    const task = tasks.find(t => t.id === row.id);
    if (!task) return;
    if (bucket === 'to-me') setStatusTask(task);
    else setReviewTask(task);
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
        onRowClick={handleRowClick}
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
              {unpublishedTeamCount > 0 && (
                <p className="text-[11px] text-gray-500 mt-1.5">
                  {unpublishedTeamCount} team{unpublishedTeamCount !== 1 ? 's' : ''} hidden — allocation not published yet.
                </p>
              )}
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
              {unpublishedTeamCount > 0 && (
                <p className="text-[11px] text-gray-500 mt-1.5">
                  Students from {unpublishedTeamCount} unpublished team{unpublishedTeamCount !== 1 ? 's' : ''} are hidden.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
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
              <label className="block text-sm text-gray-400 mb-1">Category</label>
              <Select
                value={form.category}
                onChange={v => setForm({ ...form, category: v as ApiTaskCategory })}
                options={CATEGORY_OPTIONS}
                className="w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Week</label>
              <Select
                value={form.week}
                onChange={v => setForm({ ...form, week: v as string })}
                options={WEEKS.map(w => ({ value: w, label: `Week ${w}` }))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Track</label>
              <Select
                value={form.track}
                onChange={v => setForm({ ...form, track: v as string })}
                placeholder="Select track..."
                options={TRACKS.map(t => ({ value: t, label: t }))}
                className="w-full"
              />
            </div>
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

          <Button onClick={handleSave} disabled={!canSave || savingTask} fullWidth size="lg">
            {savingTask ? 'Creating...' : 'Create Task'}
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

      <Drawer open={!!reviewTask} onClose={() => setReviewTask(null)} title="Review Assignments">
        {reviewTask && (
          <AssigneeReviewPanel
            task={reviewTask}
            onChanged={async () => {
              await fetchTasksOnly();
              // Keep the drawer's task data fresh after an approve/resubmit action.
              setReviewTask(prev => (prev ? tasks.find(t => t.id === prev.id) ?? prev : prev));
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

// Lets the mentor (as assignee, when admin handed them a task) submit or
// resubmit their own assignment through the real workflow endpoints — a
// document-category task is submitted via the Submissions tab instead
// (uploading there auto-transitions the assignment to 'review'), since
// there's no student allocation to attach a mentor's own submission to.
function TaskStatusPanel({
  task,
  mentorId,
  onChanged,
}: {
  task: ApiTask;
  mentorId: string;
  onChanged: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const assignment = task.assignments?.find(a => a.assignee_id === mentorId);

  if (!assignment) {
    return <p className="text-gray-500 text-sm">You're not assigned to this task.</p>;
  }

  const isDocumentTask = task.category === 'document_submission';
  const canSubmit = assignment.status === 'pending' || assignment.status === 'resubmit';

  const handleSubmit = async () => {
    setSaving(true);
    try {
      if (assignment.status === 'resubmit') {
        await apiResubmitTask(task.id, assignment.id);
      } else {
        await apiSubmitTask(task.id, assignment.id);
      }
      await onChanged();
    } finally {
      setSaving(false);
    }
  };

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

      <div className="bg-zinc-800/60 border border-zinc-750 rounded-lg px-3 py-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <StatusBadge status={assignment.status} />
          {assignment.status === 'resubmit' && (
            <span className="text-[11px] text-gray-500">
              {assignment.resubmit_count} of {assignment.max_resubmit_count} resubmits used
            </span>
          )}
        </div>

        {isDocumentTask ? (
          canSubmit ? (
            <p className="text-xs text-gray-500">Submit this from the Submissions tab — uploading the document moves it to review automatically.</p>
          ) : assignment.status === 'review' ? (
            <p className="text-xs text-gray-500">Waiting for review.</p>
          ) : (
            <p className="text-xs text-green-400">Approved — locked.</p>
          )
        ) : canSubmit ? (
          <Button onClick={handleSubmit} disabled={saving} size="sm" fullWidth>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {assignment.status === 'resubmit' ? 'Resubmit' : 'Submit'}
          </Button>
        ) : assignment.status === 'review' ? (
          <p className="text-xs text-gray-500">Waiting for review.</p>
        ) : (
          <p className="text-xs text-green-400">Approved — locked.</p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ApiAssignmentStatus }) {
  return (
    <span className="text-[10px] bg-zinc-800 text-gray-300 px-2 py-0.5 rounded border border-zinc-700 whitespace-nowrap flex items-center gap-1.5 w-fit">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

// Mentor-as-assigner review: approve or request a resubmit on each of their
// own students'/teams' assignments for this task. Only applies to
// non-document tasks — a document_submission task is reviewed from the
// Submissions tab instead (ReviewActions there drives the same underlying
// assignment transition, see SubmissionService.syncAssignmentStatus).
function AssigneeReviewPanel({
  task,
  onChanged,
}: {
  task: ApiTask;
  onChanged: () => Promise<void>;
}) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [resubmitDraft, setResubmitDraft] = useState<Record<string, string>>({});
  const isDocumentTask = task.category === 'document_submission';
  const assignments = task.assignments || [];

  const handleApprove = async (assignment: ApiAssignment) => {
    setSavingId(assignment.id);
    try {
      await apiApproveTask(task.id, assignment.id);
      await onChanged();
    } finally {
      setSavingId(null);
    }
  };

  const handleResubmit = async (assignment: ApiAssignment) => {
    const comment = resubmitDraft[assignment.id]?.trim();
    if (!comment) return;
    setSavingId(assignment.id);
    try {
      await apiRequestResubmit(task.id, assignment.id, comment);
      setResubmitDraft(prev => ({ ...prev, [assignment.id]: '' }));
      await onChanged();
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-white font-semibold">{task.title}</h4>
        {task.description && <p className="text-gray-400 text-sm mt-1">{task.description}</p>}
      </div>

      {isDocumentTask && (
        <p className="text-xs text-gray-400 bg-zinc-800/60 border border-zinc-750 rounded-lg px-3 py-2">
          This is a document task — review submissions from the Submissions tab instead.
        </p>
      )}

      <div className="space-y-3">
        {assignments.map(assignment => {
          const saving = savingId === assignment.id;
          return (
            <div key={assignment.id} className="bg-zinc-800/60 border border-zinc-750 rounded-lg px-3 py-3 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-200 truncate">{assignment.assignee?.full_name || assignment.assignee_id}</span>
                <StatusBadge status={assignment.status} />
              </div>

              {!isDocumentTask && assignment.status === 'review' && (
                <div className="space-y-2">
                  <textarea
                    value={resubmitDraft[assignment.id] || ''}
                    onChange={e => setResubmitDraft(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                    placeholder="Resubmit comment (required to send back for resubmission)"
                    rows={2}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-gold transition-colors resize-none"
                  />
                  <div className="flex items-center gap-2">
                    <Button onClick={() => handleApprove(assignment)} disabled={saving} size="sm" className="flex-1">
                      {saving ? <Loader2 size={13} className="animate-spin" /> : null}
                      Approve
                    </Button>
                    <Button
                      onClick={() => handleResubmit(assignment)}
                      disabled={saving || !resubmitDraft[assignment.id]?.trim()}
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                    >
                      Resubmit
                    </Button>
                  </div>
                </div>
              )}

              {assignment.status === 'resubmit' && (
                <p className="text-[11px] text-gray-500">
                  {assignment.resubmit_count} of {assignment.max_resubmit_count} resubmits used
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
