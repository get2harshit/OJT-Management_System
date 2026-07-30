import { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Calendar, Loader2, Eye } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Drawer from '../../components/Drawer';
import Select from '../../components/Select';
import Button from '../../components/Button';
import {
  apiListTasks,
  apiGetTask,
  apiCreateTask,
  apiSubmitTask,
  apiResubmitTask,
  apiSaveStructuredResponse,
  apiApproveTask,
  apiRequestResubmit,
} from '../../lib/api/tasks';
import type { ApiTask, ApiTaskCategory, ApiAssignment, ApiAssignmentStatus } from '../../lib/api/tasks';
import { apiListMyTeams } from '../../lib/api/teams';
import { apiListMyCohorts } from '../../lib/api/cohorts';
import type { Team, Cohort } from '../../lib/types';
import { TRACKS } from '../../lib/constants';
import { useToast } from '../../toast';
import { usePageRefresh } from '../../context/RefreshContext';

const CATEGORY_OPTIONS: { value: ApiTaskCategory; label: string }[] = [
  { value: 'document_submission', label: 'Document Submission' },
  { value: 'general', label: 'General (no submission)' },
  { value: 'link_submission', label: 'Link Submission' },
];

const WEEKS = Array.from({ length: 12 }, (_, i) => String(i + 1));

const EMPTY_FORM = {
  title: '',
  description: '',
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
  // Jumps to the Submissions tab with this student+task pre-selected, so a
  // document-task assignee row can be reviewed (Approve/Resubmit) from the
  // real submission detail instead of dead-ending in this drawer.
  onViewSubmission?: (studentId: string, taskId: string) => void;
}

export default function MentorTasks({ mentorId, onViewSubmission }: Props) {
  const { showSuccess, showError } = useToast();
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [myCohorts, setMyCohorts] = useState<Cohort[]>([]);
  const [publishedCohortIds, setPublishedCohortIds] = useState<Set<string>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [bucket, setBucket] = useState<TaskBucket>('to-me');
  const [assignedByFilter, setAssignedByFilter] = useState('all');
  const [statusTask, setStatusTask] = useState<ApiTask | null>(null);
  // The list only carries assignmentsSummary (a capped preview), never the
  // full per-assignee list — reviewTaskId drives the modal's open state,
  // reviewTask holds the full detail fetched on demand via apiGetTask.
  const [reviewTaskId, setReviewTaskId] = useState<string | null>(null);
  const [reviewTask, setReviewTask] = useState<ApiTask | null>(null);
  const [reviewTaskLoading, setReviewTaskLoading] = useState(false);

  const fetchTasksOnly = async () => {
    try {
      const res = await apiListTasks();
      setTasks(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const openReviewModal = async (taskId: string) => {
    setReviewTaskId(taskId);
    setReviewTask(null);
    setReviewTaskLoading(true);
    try {
      const res = await apiGetTask(taskId);
      setReviewTask(res.data);
    } catch {
      showError('Failed to load task assignments');
      setReviewTaskId(null);
    } finally {
      setReviewTaskLoading(false);
    }
  };

  const loadAll = () => {
    return Promise.all([apiListTasks(), apiListMyTeams(), apiListMyCohorts()])
      .then(([tasksRes, teamsRes, cohortsRes]) => {
        setTasks(tasksRes.data || []);
        setMyTeams(teamsRes);
        setMyCohorts(cohortsRes);
        // Checked against the sticky allocationPublishedAt rather than the
        // live allocationRunStatus enum — that enum legitimately drops back
        // to 'draft'/'review' whenever a later batch of teams gets run in
        // the same cohort, which must not re-hide an already-published
        // team from this picker.
        setPublishedCohortIds(new Set(cohortsRes.filter(c => !!c.allocationPublishedAt).map(c => c.id)));
      })
      .catch(console.error);
  };

  useEffect(() => {
    loadAll();
  }, []);

  usePageRefresh(loadAll);

  // A task must belong to exactly one cohort (backend requirement), and the
  // system only ever allows one active cohort at a time — so the mentor's
  // active membership is the one, unambiguous cohort any task they create
  // right now can belong to. The backend rejects creation entirely if this
  // is missing or inactive, so this is resolved once here instead of adding
  // a picker for a choice that never actually has more than one valid answer.
  const activeCohortId = myCohorts.find(c => c.isActive)?.id;

  // A student can't be assigned a task before their team's project
  // allocation is published — same rule the backend now enforces, applied
  // here too so the picker doesn't offer a team/student who'd just be
  // silently dropped on save.
  const publishedTeams = myTeams.filter(team => !!team.cohortId && publishedCohortIds.has(team.cohortId));
  const unpublishedTeamCount = myTeams.length - publishedTeams.length;

  // A task's track is a hard requirement (see canSave below), so once the
  // mentor picks one, only teams/students actually on that track should be
  // selectable — otherwise a track-specific task could get assigned to a
  // student working a completely different track. Before a track is picked,
  // every published team/student still shows, same as before.
  const trackFilteredTeams = form.track
    ? publishedTeams.filter(team => team.track === form.track)
    : publishedTeams;

  const teamOptions = trackFilteredTeams.map(team => ({
    value: team.id,
    label: team.members.map(m => m.fullName || 'Unnamed').join(', ') || team.track,
  }));

  const studentOptions = Array.from(
    new Map(trackFilteredTeams.flatMap(t => t.members).map(m => [m.studentId, m])).values()
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
    if (!activeCohortId) {
      showError('No active cohort found for your account — cannot create a task.');
      return;
    }

    setSavingTask(true);
    try {
      await apiCreateTask({
        title: form.title,
        description: form.description || undefined,
        target_role: 'student',
        category: form.category,
        assign_mode: form.assignMode,
        teamIds: form.assignMode === 'team' ? form.teamIds : undefined,
        assignees: form.assignMode === 'individual' ? form.assignees : undefined,
        start_date: new Date(form.startDate).toISOString(),
        deadline: new Date(form.dueDate).toISOString(),
        week: `Week ${form.week}`,
        track: form.track,
        cohort_id: activeCohortId,
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

  // Mirrors the backend's own mentor scoping for GET /tasks: assigned_by_id
  // === me, OR I'm personally an assignee, OR one of my own students is an
  // assignee (e.g. admin gave the task straight to a mentee) — the list is
  // already exactly this set, so the two buckets below just split "my own
  // assignment" from "everything else I'm allowed to see" (both my own
  // creations and my students' admin-assigned work land in the latter).
  const assignedToMe = tasks.filter(t => t.myAssignment != null);
  const studentTasks = tasks.filter(t => t.myAssignment == null);
  const bucketTasks = bucket === 'to-me' ? assignedToMe : studentTasks;

  // Independent of the bucket toggle above — narrows either bucket down to
  // just what I created myself vs. what admin handed down. Within this
  // mentor's visible task set the assigner is always either me or an admin/
  // batch_manager (a mentor can only ever create tasks for their own teams),
  // so a simple identity check is all "assigned by admin" needs.
  const visibleTasks = bucketTasks.filter(t => {
    if (assignedByFilter === 'me') return t.assigned_by_id === mentorId;
    if (assignedByFilter === 'admin') return t.assigned_by_id !== mentorId;
    return true;
  });

  // Who can approve/resubmit which assignment row, per the backend's own
  // rule: the task's own assigner, or the assignee's own mentor. Computed
  // once here (from the roster already loaded for the Create Task drawer)
  // instead of per-row, since a batch-assigned task can mix students across
  // different mentors.
  const myStudentIds = useMemo(
    () => new Set(myTeams.flatMap(t => t.members.map(m => m.studentId))),
    [myTeams]
  );

  const tableData = visibleTasks.map(t => {
    const summary = t.assignmentsSummary;
    const preview = summary?.preview ?? [];
    const assignees = preview.length > 0
      ? preview.map(a => ({ name: a.fullName || a.assigneeId, status: a.status }))
      : [{ name: 'All', status: undefined as ApiAssignmentStatus | undefined }];
    const extraCount = (summary?.total ?? 0) - preview.length;

    return {
      id: t.id,
      title: t.title,
      description: t.description || '-',
      type: t.target_role === 'student' ? 'Student' : 'Mentor',
      assignerName: t.assigner?.full_name,
      assignerRole: t.assigner?.role,
      myStatus: t.myAssignment?.status,
      assignees,
      extraCount,
      start_date: t.start_date ? new Date(t.start_date).toLocaleDateString() : '-',
      due_date: t.deadline ? new Date(t.deadline).toLocaleDateString() : '-',
    };
  });

  const renderAssignedBy = (row: (typeof tableData)[number]) => {
    if (!row.assignerName) return <span className="text-xs text-gray-500">-</span>;
    const isAdmin = row.assignerRole === 'admin' || row.assignerRole === 'batch_manager';
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-200 whitespace-nowrap">
        {row.assignerName}
        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${
          isAdmin
            ? 'bg-gold/10 text-gold border-gold/25'
            : 'bg-purple-500/10 text-purple-400 border-purple-500/25'
        }`}>
          {isAdmin ? 'Admin' : 'Mentor'}
        </span>
      </span>
    );
  };

  const toMeColumns = [
    { key: 'title', header: 'Title' },
    { key: 'description', header: 'Description' },
    { key: 'assignedBy', header: 'Assigned By', render: renderAssignedBy },
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
    { key: 'assignedBy', header: 'Assigned By', render: renderAssignedBy },
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
          {row.extraCount > 0 && (
            <span className="text-[10px] bg-zinc-800/50 text-gray-400 px-2 py-0.5 rounded border border-zinc-800 whitespace-nowrap">
              +{row.extraCount} more
            </span>
          )}
        </div>
      ),
    },
    { key: 'start_date', header: 'Start Date' },
    { key: 'due_date', header: 'Due Date' },
  ];

  const handleRowClick = (row: (typeof tableData)[number]) => {
    if (bucket === 'to-me') {
      const task = tasks.find(t => t.id === row.id);
      if (task) setStatusTask(task);
    } else {
      openReviewModal(row.id);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Tasks</h1>
          <p className="text-gray-400 text-sm mt-1">View tasks assigned to you or your students</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={bucket}
            onChange={(v) => setBucket(v as TaskBucket)}
            variant="filter"
            className="w-[180px]"
            options={[
              { value: 'to-others', label: `Students' Tasks (${studentTasks.length})` },
              { value: 'to-me', label: `My Tasks (${assignedToMe.length})` },
            ]}
          />
          <Select
            value={assignedByFilter}
            onChange={(v) => setAssignedByFilter(v as string)}
            variant="filter"
            className="w-[160px]"
            options={[
              { value: 'all', label: 'Assigned by anyone' },
              { value: 'me', label: 'Assigned by me' },
              { value: 'admin', label: 'Assigned by admin' },
            ]}
          />
          <Button onClick={() => setDrawerOpen(true)} leftIcon={<Plus size={18} />} className="hover:scale-105">
            Create Task
          </Button>
        </div>
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

          <div>
            <label className="block text-sm text-gray-400 mb-1">Category</label>
            <Select
              value={form.category}
              onChange={v => setForm({ ...form, category: v as ApiTaskCategory })}
              options={CATEGORY_OPTIONS}
              className="w-full"
            />
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
                onChange={v => setForm({ ...form, track: v as string, teamIds: [], assignees: [] })}
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
            onChanged={async () => {
              await fetchTasksOnly();
            }}
          />
        )}
      </Drawer>

      <Drawer
        open={!!reviewTaskId}
        onClose={() => { setReviewTaskId(null); setReviewTask(null); }}
        title="Review Assignments"
      >
        {reviewTaskLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={28} className="animate-spin text-gray-500" />
          </div>
        ) : reviewTask ? (
          <AssigneeReviewPanel
            task={reviewTask}
            mentorId={mentorId}
            myStudentIds={myStudentIds}
            onViewSubmission={onViewSubmission}
            onChanged={async () => {
              await openReviewModal(reviewTask.id);
              await fetchTasksOnly();
            }}
          />
        ) : null}
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
  task: listTask,
  onChanged,
}: {
  task: ApiTask;
  onChanged: () => Promise<void>;
}) {
  const { showError } = useToast();
  const [saving, setSaving] = useState(false);
  // The list row (listTask) never carries checklist_items/qna_questions —
  // excluded from the bulk list response by design (see TaskRepository's
  // findAllTasks select). Fetch the single-task detail once this drawer
  // opens to get them, same "full detail on demand" pattern already used
  // for review panels elsewhere on this page.
  const [detail, setDetail] = useState<ApiTask | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  // Local check/answer state, seeded from the assignment's saved
  // structured_response once detail loads — draft-saved on every change via
  // apiSaveStructuredResponse, independent of the final Submit action.
  const [checklistAnswers, setChecklistAnswers] = useState<Record<string, boolean>>({});
  const [qnaAnswers, setQnaAnswers] = useState<Record<string, string>>({});
  const saveDraftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setLoadingDetail(true);
    apiGetTask(listTask.id)
      .then((res) => {
        if (cancelled) return;
        setDetail(res.data);
        const response = res.data.myAssignment?.structured_response;
        setChecklistAnswers(response?.checklist ?? {});
        setQnaAnswers(response?.qna ?? {});
      })
      .catch(() => showError('Failed to load task details'))
      .finally(() => { if (!cancelled) setLoadingDetail(false); });
    return () => { cancelled = true; };
  }, [listTask.id, showError]);

  const task = detail ?? listTask;
  const assignment = task.myAssignment;

  const checklistItems = task.checklist_items ?? [];
  const qnaQuestions = task.qna_questions ?? [];
  const hasStructuredContent = checklistItems.length > 0 || qnaQuestions.length > 0;

  // Fires on every checkbox toggle / answer edit — debounced so typing in a
  // Q&A answer doesn't fire a request per keystroke, but still lands well
  // before a mentor would plausibly hit Submit next.
  const scheduleDraftSave = (nextChecklist: Record<string, boolean>, nextQna: Record<string, string>) => {
    if (!assignment) return;
    if (saveDraftTimer.current) clearTimeout(saveDraftTimer.current);
    saveDraftTimer.current = setTimeout(() => {
      apiSaveStructuredResponse(task.id, assignment.id, { checklist: nextChecklist, qna: nextQna }).catch(() => {
        showError('Failed to save your progress — try again');
      });
    }, 600);
  };

  const toggleChecklistItem = (itemId: string) => {
    const next = { ...checklistAnswers, [itemId]: !checklistAnswers[itemId] };
    setChecklistAnswers(next);
    scheduleDraftSave(next, qnaAnswers);
  };

  const updateQnaAnswer = (questionId: string, value: string) => {
    const next = { ...qnaAnswers, [questionId]: value };
    setQnaAnswers(next);
    scheduleDraftSave(checklistAnswers, next);
  };

  if (loadingDetail) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 size={20} className="animate-spin text-gray-500" />
      </div>
    );
  }

  if (!assignment) {
    return <p className="text-gray-500 text-sm">You're not assigned to this task.</p>;
  }

  const isDocumentTask = task.category === 'document_submission';
  const canSubmit = assignment.status === 'pending' || assignment.status === 'resubmit';
  const allChecklistDone = checklistItems.every(item => checklistAnswers[item.id] === true);
  const allQnaAnswered = qnaQuestions.every(q => !!qnaAnswers[q.id]?.trim());
  const structuredComplete = allChecklistDone && allQnaAnswered;

  const handleSubmit = async () => {
    setSaving(true);
    try {
      // Flush the latest answers before submit — the debounced draft-save
      // above may not have fired yet if the mentor checked the last box and
      // immediately hit Submit.
      if (hasStructuredContent) {
        if (saveDraftTimer.current) clearTimeout(saveDraftTimer.current);
        await apiSaveStructuredResponse(task.id, assignment.id, { checklist: checklistAnswers, qna: qnaAnswers });
      }
      if (assignment.status === 'resubmit') {
        await apiResubmitTask(task.id, assignment.id);
      } else {
        await apiSubmitTask(task.id, assignment.id);
      }
      await onChanged();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to submit');
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

      {checklistItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 uppercase font-semibold tracking-wider">Checklist</p>
          <div className="space-y-1.5">
            {checklistItems.map(item => (
              <label
                key={item.id}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                  checklistAnswers[item.id] ? 'bg-gold/5 border-gold/30' : 'bg-zinc-900 border-zinc-750'
                } ${assignment.status === 'approved' ? 'opacity-60 pointer-events-none' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={!!checklistAnswers[item.id]}
                  onChange={() => toggleChecklistItem(item.id)}
                  className="accent-gold w-4 h-4 shrink-0"
                />
                <span className="text-sm text-gray-200">{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {qnaQuestions.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400 uppercase font-semibold tracking-wider">Questions</p>
          {qnaQuestions.map(q => (
            <div key={q.id}>
              <label className="block text-sm text-gray-300 mb-1">{q.question}</label>
              <textarea
                value={qnaAnswers[q.id] ?? ''}
                onChange={e => updateQnaAnswer(q.id, e.target.value)}
                disabled={assignment.status === 'approved'}
                rows={2}
                className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold transition-colors resize-none disabled:opacity-60"
              />
            </div>
          ))}
        </div>
      )}

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
          <>
            {hasStructuredContent && !structuredComplete && (
              <p className="text-[11px] text-amber-400">
                {!allChecklistDone && !allQnaAnswered
                  ? 'Check every item and answer every question to submit.'
                  : !allChecklistDone
                  ? 'Check every item to submit.'
                  : 'Answer every question to submit.'}
              </p>
            )}
            <Button
              onClick={handleSubmit}
              disabled={saving || (hasStructuredContent && !structuredComplete)}
              size="sm"
              fullWidth
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {assignment.status === 'resubmit' ? 'Resubmit' : 'Submit'}
            </Button>
          </>
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

// Mentor-as-assigner review: every category (document/general/link) is now
// submitted with real content through the Submissions tab (student's popup
// picks the input by task.category, see submissionKindForCategory in
// student/Submissions.tsx), and ReviewActions there drives the same
// underlying assignment transition (SubmissionService.syncAssignmentStatus).
// So this panel never approves/resubmits blind — it only routes to the
// actual submission to review.
function AssigneeReviewPanel({
  task,
  mentorId,
  myStudentIds,
  onViewSubmission,
  onChanged,
}: {
  task: ApiTask;
  mentorId: string;
  // Mirrors the backend's approve/resubmit rule: the task's own assigner,
  // or the assignee's own mentor, can act on a row — checked per-assignment
  // (not per-task) since a batch-assigned task can mix students across
  // different mentors.
  myStudentIds: Set<string>;
  onViewSubmission?: (studentId: string, taskId: string) => void;
  onChanged?: () => Promise<void>;
}) {
  const assignments = task.assignments || [];
  const isTaskAssigner = task.assigned_by_id === mentorId;
  const canReviewAssignment = (assignment: ApiAssignment) => isTaskAssigner || myStudentIds.has(assignment.assignee_id);
  // Checklist/Q&A tasks have no document/submission at all — this panel
  // reviews them itself (checked-items + answers, then Approve/Resubmit)
  // instead of the usual "open the Submissions tab" handoff, which has
  // nothing to show for a task shaped like this.
  const hasStructuredContent = (task.checklist_items?.length ?? 0) > 0 || (task.qna_questions?.length ?? 0) > 0;

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-white font-semibold">{task.title}</h4>
        {task.description && <p className="text-gray-400 text-sm mt-1">{task.description}</p>}
      </div>

      {!hasStructuredContent && (
        <p className="text-xs text-gray-400 bg-zinc-800/60 border border-zinc-750 rounded-lg px-3 py-2">
          Open a submitted row's submission below to approve or resubmit it.
        </p>
      )}

      {!isTaskAssigner && (
        <p className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          Assigned by admin — as your students' mentor, you can still approve or request changes on their rows below.
        </p>
      )}

      <div className="space-y-3">
        {assignments.map(assignment => {
          const canReview = canReviewAssignment(assignment);
          return hasStructuredContent ? (
            <StructuredAssignmentReviewRow
              key={assignment.id}
              task={task}
              assignment={assignment}
              canReview={canReview}
              onChanged={onChanged}
            />
          ) : (
            <div key={assignment.id} className="bg-zinc-800/60 border border-zinc-750 rounded-lg px-3 py-3 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-200 truncate">{assignment.assignee?.full_name || assignment.assignee_id}</span>
                <StatusBadge status={assignment.status} />
              </div>

              {!canReview && assignment.status === 'review' && (
                <p className="text-[11px] text-gray-500">Not one of your students — you can view this but can't review it.</p>
              )}

              {canReview && assignment.status !== 'pending' && (
                <button
                  onClick={() => onViewSubmission?.(assignment.assignee_id, task.id)}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-gold hover:text-gold/80 bg-gold/10 hover:bg-gold/15 border border-gold/25 rounded-lg py-2 transition-colors"
                >
                  <Eye size={13} />
                  View Submission
                </button>
              )}

              {assignment.status === 'pending' && (
                <p className="text-[11px] text-gray-500">Not submitted yet.</p>
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

// One assignee's row for a checklist/Q&A task — read-only view of their
// saved answers (collapsed until the reviewer expands it), plus Approve/
// Resubmit once it's actually in 'review'. Mirrors the shape of the
// mentor's own TaskStatusPanel checklist/Q&A rendering, but never editable.
function StructuredAssignmentReviewRow({
  task,
  assignment,
  canReview,
  onChanged,
}: {
  task: ApiTask;
  assignment: ApiAssignment;
  canReview: boolean;
  onChanged?: () => Promise<void>;
}) {
  const { showError } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState<'approve' | 'resubmit' | null>(null);

  const checklistItems = task.checklist_items ?? [];
  const qnaQuestions = task.qna_questions ?? [];
  const checklistAnswers = assignment.structured_response?.checklist ?? {};
  const qnaAnswers = assignment.structured_response?.qna ?? {};

  const handleApprove = async () => {
    setSaving('approve');
    try {
      await apiApproveTask(task.id, assignment.id, comment.trim() || undefined);
      await onChanged?.();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setSaving(null);
    }
  };

  const handleResubmit = async () => {
    if (!comment.trim()) {
      showError('A comment is required when requesting a resubmit');
      return;
    }
    setSaving('resubmit');
    try {
      await apiRequestResubmit(task.id, assignment.id, comment.trim());
      await onChanged?.();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to request resubmit');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="bg-zinc-800/60 border border-zinc-750 rounded-lg px-3 py-3 space-y-2.5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <span className="text-sm text-gray-200 truncate">{assignment.assignee?.full_name || assignment.assignee_id}</span>
        <StatusBadge status={assignment.status} />
      </button>

      {assignment.status === 'pending' && (
        <p className="text-[11px] text-gray-500">Not submitted yet.</p>
      )}

      {expanded && assignment.status !== 'pending' && (
        <div className="space-y-3 pt-1">
          {checklistItems.map(item => (
            <label key={item.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-750">
              <input type="checkbox" checked={!!checklistAnswers[item.id]} disabled className="accent-gold w-4 h-4 shrink-0 opacity-80" />
              <span className="text-sm text-gray-300">{item.label}</span>
            </label>
          ))}
          {qnaQuestions.map(q => (
            <div key={q.id}>
              <p className="text-xs text-gray-500 mb-1">{q.question}</p>
              <p className="text-sm text-gray-200 bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 whitespace-pre-wrap">
                {qnaAnswers[q.id] || <span className="text-gray-600">No answer</span>}
              </p>
            </div>
          ))}

          {canReview && assignment.status === 'review' && (
            <div className="space-y-2 pt-1">
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Optional comment (required for resubmit)"
                rows={2}
                className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold transition-colors resize-none placeholder-gray-500"
              />
              <div className="flex gap-2">
                <Button onClick={handleApprove} disabled={saving !== null} size="sm" fullWidth>
                  {saving === 'approve' ? <Loader2 size={14} className="animate-spin" /> : null}
                  Approve
                </Button>
                <Button onClick={handleResubmit} disabled={saving !== null} variant="secondary" size="sm" fullWidth>
                  {saving === 'resubmit' ? <Loader2 size={14} className="animate-spin" /> : null}
                  Resubmit
                </Button>
              </div>
            </div>
          )}

          {!canReview && assignment.status === 'review' && (
            <p className="text-[11px] text-gray-500">Not one of your students — you can view this but can't review it.</p>
          )}

          {assignment.status === 'resubmit' && (
            <p className="text-[11px] text-gray-500">
              {assignment.resubmit_count} of {assignment.max_resubmit_count} resubmits used
            </p>
          )}
        </div>
      )}
    </div>
  );
}
