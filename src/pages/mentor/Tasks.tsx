import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Calendar, Loader2, Eye, UserX } from 'lucide-react';
import DataTable from '../../components/DataTable';
import PageLayout from '../../components/PageLayout';
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
import type { Team } from '../../lib/types';
import { useToast } from '../../toast';
import { usePageRefresh } from '../../context/RefreshContext';
import { useTracks } from '../../hooks/useTracks';

const CATEGORY_OPTIONS: { value: ApiTaskCategory; label: string }[] = [
  { value: 'document_submission', label: 'Document Submission' },
  { value: 'general', label: 'General (Text Response)' },
  { value: 'link_submission', label: 'Link Submission' },
];

const WEEKS = Array.from({ length: 12 }, (_, i) => String(i + 1));

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

const EMPTY_FORM = {
  title: '',
  description: '',
  category: 'document_submission' as ApiTaskCategory,
  assignMode: 'team' as 'team' | 'individual',
  teamIds: [] as string[],
  assignees: [] as string[],
  week: '1',
  tracks: [] as string[],
  startDate: '',
  dueDate: '',
};

type TaskBucket = 'all' | 'to-me' | 'to-others';

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
  const navigate = useNavigate();
  // The OJT this page is scoped to, from the route.
  const { cohortId } = useParams<{ cohortId: string }>();
  const { showSuccess, showError } = useToast();
  const { options: trackOptions } = useTracks();
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [bucket, setBucket] = useState<TaskBucket>('all');
  const [assignedByFilter, setAssignedByFilter] = useState('all');
  // Real backend pagination + search (mirrors admin/Tasks.tsx) — the list
  // used to be fetched with no page/limit at all, which meant the backend's
  // own default (limit 20) silently capped it with no page control, so any
  // mentor with more than 20 visible tasks lost the rest with no sign they
  // were missing. `bucket`/`assignedByFilter` below still split whatever
  // page is currently loaded client-side (same accepted tradeoff as admin's
  // roleFilter/statusFilter) — only the base fetch itself needed fixing.
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
  // Drives DataTable's own overlay spinner — the list used to swap silently
  // on load/page/search/filter with no feedback at all.
  const [tasksLoading, setTasksLoading] = useState(true);
  const [statusTask, setStatusTask] = useState<ApiTask | null>(null);
  // The list only carries assignmentsSummary (a capped preview), never the
  // full per-assignee list — reviewTaskId drives the modal's open state,
  // reviewTask holds the full detail fetched on demand via apiGetTask.
  const [reviewTaskId, setReviewTaskId] = useState<string | null>(null);
  const [reviewTask, setReviewTask] = useState<ApiTask | null>(null);
  const [reviewTaskLoading, setReviewTaskLoading] = useState(false);

  // Used to refresh the list in place after create/approve/resubmit — must
  // carry the same cohort_id + page/limit/search as loadAll below, or a
  // refresh right after acting on a task can silently swap in a different
  // cohort's tasks (no cohort_id was ever passed here before) and reset back
  // to an unpaginated, uncapped page 1.
  const fetchTasksOnly = useCallback(async () => {
    if (!cohortId) return;
    setTasksLoading(true);
    try {
      const res = await apiListTasks({ cohort_id: cohortId, page, limit, search: search || undefined });
      setTasks(res.data || []);
      setPagination(res.pagination);
    } catch (e) {
      console.error(e);
    } finally {
      setTasksLoading(false);
    }
  }, [cohortId, page, limit, search]);

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

  const loadAll = useCallback(() => {
    if (!cohortId) return Promise.resolve();
    setTasksLoading(true);
    return Promise.all([
      apiListTasks({ cohort_id: cohortId, page, limit, search: search || undefined }),
      apiListMyTeams(),
    ])
      .then(([tasksRes, teamsRes]) => {
        setTasks(tasksRes.data || []);
        setPagination(tasksRes.pagination);
        setMyTeams(teamsRes);
      })
      .catch(console.error)
      .finally(() => setTasksLoading(false));
  }, [cohortId, page, limit, search]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  usePageRefresh(loadAll);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearchChange = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleLimitChange = (value: number) => {
    setPage(1);
    setLimit(value);
  };

  // A task belongs to exactly one OJT, and that OJT is the one this page is
  // open on — the URL, not a separately-resolved "active" membership, so a
  // mentor cannot be reading one OJT's tasks while creating into another.
  // The backend still rejects creation into an OJT that is not active, and
  // remains the authority on that.
  const activeCohortId = cohortId;

  // Unpublished teams used to be filtered out here, from a cohort-level
  // allocationPublishedAt. /teams/my-teams now excludes them outright — and
  // does it properly, comparing each team's own allocation_resolved_at, which
  // the cohort-level check could not do: a team drafted after an earlier
  // publish passed it. Nothing to filter here any more.
  const publishedTeams = myTeams;

  // A task's track(s) are a hard requirement (see canSave below), so once the
  // mentor picks at least one, only teams/students on one of those tracks
  // should be selectable — otherwise a track-specific task could get
  // assigned to a student working a completely different track. Before any
  // track is picked, every published team/student still shows, same as
  // before.
  const trackFilteredTeams = form.tracks.length > 0
    ? publishedTeams.filter(team => form.tracks.includes(team.track))
    : publishedTeams;

  // Only the tracks this mentor actually has a team in — not every track in
  // the system, most of which they have nothing to do with.
  const myTrackSlugs = Array.from(new Set(myTeams.map(team => team.track)));
  const myTrackOptions = trackOptions.filter(opt => myTrackSlugs.includes(opt.value as string));

  // Team name/number first, then who's on it — a bare list of student names
  // gave no way to tell teams apart when picking among several.
  const teamOptions = trackFilteredTeams.map(team => ({
    value: team.id,
    label: `${team.name ?? team.track}: ${team.members.map(m => m.fullName || 'Unnamed').join(', ') || 'No members yet'}`,
  }));

  const studentOptions = Array.from(
    new Map(trackFilteredTeams.flatMap(t => t.members).map(m => [m.studentId, m])).values()
  ).map(m => ({ value: m.studentId, label: m.fullName || m.studentId }));

  const canSave =
    !!form.title &&
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
        // Picking a track narrows who's selectable; skipping it means "every
        // track I have" rather than blocking the save on an unnecessary choice.
        tracks: form.tracks.length > 0 ? form.tracks : myTrackSlugs,
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
  // Same tradeoff as admin/Tasks.tsx's roleFilter/statusFilter: this split
  // (and assignedByFilter below) applies client-side over whatever page is
  // currently loaded, not the mentor's full task set — the backend has no
  // "assignee is me" filter for a mentor to split on server-side. The counts
  // in the bucket dropdown below are per-page counts for the same reason.
  const assignedToMe = tasks.filter(t => t.myAssignment != null);
  const studentTasks = tasks.filter(t => t.myAssignment == null);
  const bucketTasks = bucket === 'all' ? tasks : bucket === 'to-me' ? assignedToMe : studentTasks;

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
    // Only meaningful on a task I assigned myself, to a student: the roster
    // moves on (reassignments happen), but a task's assignment list never
    // does — it's history. Flag anyone the preview still lists who's since
    // left my current roster, instead of silently showing a "ghost" student.
    const isMine = t.assigned_by_id === mentorId;
    const assignees = preview.length > 0
      ? preview.map(a => ({
          name: a.fullName || a.assigneeId,
          status: a.status,
          movedAway: isMine && t.target_role === 'student' && !myStudentIds.has(a.assigneeId),
        }))
      : [{ name: 'All', status: undefined as ApiAssignmentStatus | undefined, movedAway: false }];
    const extraCount = (summary?.total ?? 0) - preview.length;

    return {
      id: t.id,
      // Row-level truth, not the page-level bucket toggle — the "All Tasks"
      // view mixes both kinds of row in one table, so each row has to carry
      // which kind it is itself rather than the whole table assuming one.
      isMyTask: t.myAssignment != null,
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

  const renderMyStatus = (row: (typeof tableData)[number]) => {
    const status = row.myStatus || 'pending';
    return (
      <span className="text-[10px] bg-zinc-800 text-gray-300 px-2 py-0.5 rounded border border-zinc-700 whitespace-nowrap flex items-center gap-1.5 w-fit">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
        {STATUS_LABEL[status]}
      </span>
    );
  };

  const renderTargetRole = (row: (typeof tableData)[number]) => (
    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${row.type === 'Student' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/25' : 'bg-purple-500/10 text-purple-400 border border-purple-500/25'}`}>
      {row.type}
    </span>
  );

  const renderAssignees = (row: (typeof tableData)[number]) => (
    <div className="max-w-[250px] flex flex-wrap gap-1.5 py-1">
      {row.assignees.map((a: { name: string; status?: ApiAssignmentStatus; movedAway?: boolean }, i: number) => (
        <span
          key={i}
          title={a.status ? STATUS_LABEL[a.status] : undefined}
          className="text-[10px] bg-zinc-800 text-gray-300 px-2 py-0.5 rounded border border-zinc-700 whitespace-nowrap flex items-center gap-1"
        >
          {a.status && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[a.status]}`} />}
          {a.name}
          {a.movedAway && (
            <span
              title="No longer under you — reassigned to another mentor"
              className="inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded-full px-1.5 py-0.5 ml-0.5"
            >
              <UserX size={9} />
              Moved
            </span>
          )}
        </span>
      ))}
      {row.extraCount > 0 && (
        <span className="text-[10px] bg-zinc-800/50 text-gray-400 px-2 py-0.5 rounded border border-zinc-800 whitespace-nowrap">
          +{row.extraCount} more
        </span>
      )}
    </div>
  );

  const toMeColumns = [
    { key: 'title', header: 'Title' },
    { key: 'description', header: 'Description' },
    { key: 'assignedBy', header: 'Assigned By', render: renderAssignedBy },
    { key: 'myStatus', header: 'My Status', render: renderMyStatus },
    { key: 'due_date', header: 'Due Date' },
  ];

  const toOthersColumns = [
    { key: 'title', header: 'Title' },
    { key: 'description', header: 'Description' },
    { key: 'type', header: 'Target Role', render: renderTargetRole },
    { key: 'assignedBy', header: 'Assigned By', render: renderAssignedBy },
    { key: 'assignees', header: 'Assigned To', render: renderAssignees },
    { key: 'start_date', header: 'Start Date' },
    { key: 'due_date', header: 'Due Date' },
  ];

  // The combined view mixes a row that's mine (has a status of my own) with
  // a row that's my students' (has a set of assignees instead) — one column
  // that renders whichever of those actually applies to that row, rather
  // than two columns each half-empty depending on the row.
  const allColumns = [
    { key: 'title', header: 'Title' },
    { key: 'description', header: 'Description' },
    { key: 'type', header: 'Target Role', render: renderTargetRole },
    { key: 'assignedBy', header: 'Assigned By', render: renderAssignedBy },
    {
      key: 'status',
      header: 'Status / Assigned To',
      render: (row: (typeof tableData)[number]) => (row.isMyTask ? renderMyStatus(row) : renderAssignees(row)),
    },
    { key: 'due_date', header: 'Due Date' },
  ];

  const handleRowClick = (row: (typeof tableData)[number]) => {
    // Row-level, not the bucket toggle — the "All Tasks" view mixes both
    // kinds of row, so which click behaviour applies has to come from the
    // row itself.
    if (row.isMyTask) {
      const task = tasks.find(t => t.id === row.id);
      if (!task) return;
      // A weekly report is a full grid of teams and students — far more
      // than a side drawer holds — so it gets its own page rather than
      // being squeezed into the status panel the other task shapes use.
      if (task.category === 'weekly_report') {
        navigate(`/mentor/dashboard/tasks/${task.id}/weekly-report`);
        return;
      }
      setStatusTask(task);
    } else {
      openReviewModal(row.id);
    }
  };

  return (
    <PageLayout className="space-y-4">
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
              { value: 'all', label: `All Tasks (${tasks.length})` },
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
        columns={bucket === 'all' ? allColumns : bucket === 'to-me' ? toMeColumns : toOthersColumns}
        data={tableData}
        searchPlaceholder="Search tasks..."
        onRowClick={handleRowClick}
        onSearchChange={handleSearchChange}
        serverPagination={{
          page: pagination.page,
          limit: pagination.limit,
          total: pagination.total,
          totalPages: pagination.pages,
          onPageChange: setPage,
          onLimitChange: handleLimitChange,
        }}
        loading={tasksLoading}
        hideExport
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

          <div>
            <label className="block text-sm text-gray-400 mb-1">Track</label>
            <Select
              isMulti
              value={form.tracks}
              onChange={v => setForm({ ...form, tracks: v as string[], teamIds: [], assignees: [] })}
              placeholder="Select track(s)..."
              options={myTrackOptions}
              className="w-full"
            />
            <p className="text-[11px] text-gray-500 mt-1.5">
              Leave empty to include every track you have.
            </p>
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
              {myTeams.length === 0 && (
                <p className="text-[11px] text-gray-500 mt-1.5">
                  No teams yet — a team appears here once its allocation is published.
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
              {myTeams.length === 0 && (
                <p className="text-[11px] text-gray-500 mt-1.5">
                  No students yet — they appear here once their team&apos;s allocation is published.
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
                onChange={e => {
                  const startDate = e.target.value;
                  // End date must always be after start date — if the
                  // already-picked end date no longer qualifies, clear it
                  // instead of leaving a silently-invalid value in place.
                  const dueDate = form.dueDate && startDate && new Date(form.dueDate) <= new Date(startDate)
                    ? ''
                    : form.dueDate;
                  setForm({ ...form, startDate, dueDate });
                }}
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
                min={form.startDate || undefined}
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
    </PageLayout>
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
          // Same "left the roster since this task was assigned" signal as the
          // list view — only meaningful for a task I assigned myself.
          const movedAway = isTaskAssigner && task.target_role === 'student' && !myStudentIds.has(assignment.assignee_id);
          // Checklist/Q&A content only exists on mentor-targeted tasks (see
          // ojt_tasks.checklist_items's own comment) — "moved to another
          // mentor" is a student-roster concept, so it never applies here.
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
                <span className="text-sm text-gray-200 truncate flex items-center gap-1.5">
                  {assignment.assignee?.full_name || assignment.assignee_id}
                  {movedAway && (
                    <span
                      title="No longer under you — reassigned to another mentor"
                      className="inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded-full px-1.5 py-0.5 shrink-0"
                    >
                      <UserX size={9} />
                      Moved
                    </span>
                  )}
                </span>
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
