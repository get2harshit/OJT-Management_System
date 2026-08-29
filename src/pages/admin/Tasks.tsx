import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Plus, Trash2, Calendar, Edit2, User, CheckCircle2, Clock, Circle, ClipboardList, Loader2, X, UserPlus, UserMinus, Send } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import DataTable from '../../components/DataTable';
import PageLayout from '../../components/PageLayout';
import {
  apiListTasks,
  apiGetTask,
  apiDeleteTask,
  apiUpdateTask,
  apiAddTaskAssignees,
  apiRemoveTaskAssignment,
  apiBulkRequestResubmit,
} from '../../lib/api/tasks';
import type { ApiTask, ApiAssignment, ApiAssignmentStatus } from '../../lib/api/tasks';
import { apiListStudents } from '../../lib/api/students';
import { apiGetTeamsForCohortDetailed } from '../../lib/api/allocations';
import Button from '../../components/Button';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import ActionsMenu from '../../components/ActionsMenu';
import AssigneePickerTable, { dedupeStudentRows } from '../../components/AssigneePickerTable';
import type { AssigneePickerStudentRow, AssigneePickerTeamRow } from '../../components/AssigneePickerTable';
import { getTrackColor } from '../../lib/constants';
import { useTracks } from '../../hooks/useTracks';
import { useToast } from '../../toast';
import { useConfirm } from '../../confirm';
import { apiListCohorts } from '../../lib/api';
import type { Cohort } from '../../lib/types';
import { usePageRefresh } from '../../context/RefreshContext';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

interface Props {
  // A student-targeted task is always a plain document/general/link
  // submission task (weekly_report and checklist/Q&A content only ever
  // exist on mentor-targeted tasks) — so clicking one jumps straight to the
  // Submissions tab scoped to this task's own assignees instead of the
  // per-task detail page, which the mentor-targeted shapes still need for
  // their own specialised (non-submission) review UI. cohortId is threaded
  // through rather than resolved by the caller — same reason
  // TaskDetailPage's onViewSubmission does it: the page that already has
  // the param from its own route is the simplest place to get it from.
  onViewTaskSubmissions?: (taskId: string, cohortId: string) => void;
}

export default function AdminTasks({ onViewTaskSubmissions }: Props) {
  const { tracks, options: trackOptions } = useTracks();
  const trackNameBySlug = useMemo(() => new Map(tracks.map(t => [t.slug, t.name])), [tracks]);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
  // Drives DataTable's own overlay spinner — the list used to swap silently
  // on load/page/search/filter with no feedback at all.
  const [tasksLoading, setTasksLoading] = useState(true);
  // roleFilter/statusFilter apply client-side, over whatever page is
  // currently loaded — the backend has no target_role filter, and
  // statusFilter is an aggregate rolled up across *all* of a task's
  // assignments (there's no raw column for it to filter server-side on).
  // With the real task counts this app runs at today that's not
  // noticeable, but a filtered view can show fewer than `limit` rows on a
  // page — a full server-side fix would need the backend to compute the
  // aggregate itself.
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  // 'admin' = created by any admin/batch_manager (not just this one — the
  // dropdown literally says "By Admin", so it has to mean the role, the same
  // way 'mentor' already means any mentor, not just one), 'mentor' = created
  // by any mentor (mentors can create tasks for their own students too) —
  // same client-side-over-current-page approach as roleFilter/statusFilter
  // above. Defaults to 'all' — the page should open showing every task, not
  // pre-narrowed to one creator.
  const [assignedByFilter, setAssignedByFilter] = useState('all');
  const [searchParams, setSearchParams] = useSearchParams();
  // Set only via a ?assignedById= link (e.g. the Mentor Workspace's "tasks
  // created by this mentor" link) — no picker in this UI for it, since the
  // point is a scoped deep link, not a filter someone hand-picks. Unlike
  // assignedByFilter above, this is a real server-side filter (see
  // apiListTasks below), so it stays correct across every page, not just
  // whatever happens to be currently loaded.
  const [assignedById, setAssignedById] = useState(searchParams.get('assignedById') || '');
  const [assignedByName, setAssignedByName] = useState('');
  // editingTaskId opens the Edit Task modal immediately (with a loading
  // state), the full task loads into editTaskDetail once apiGetTask resolves.
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    week: '1',
    tracks: [] as string[],
    deadline: ''
  });
  // Full task detail behind the Edit modal — handleEditClick fetches this
  // via apiGetTask before opening, since the list row's ApiTask only
  // carries a 5-row assignmentsSummary preview, not the full assignments
  // array the assignee-management section below needs.
  const [editTaskDetail, setEditTaskDetail] = useState<ApiTask | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [removingAssignmentId, setRemovingAssignmentId] = useState<string | null>(null);
  const [resubmitSelected, setResubmitSelected] = useState<Set<string>>(new Set());
  const [resubmitComment, setResubmitComment] = useState('');
  const [bulkResubmitting, setBulkResubmitting] = useState(false);
  const [addAssigneesOpen, setAddAssigneesOpen] = useState(false);
  const [addCandidateStudents, setAddCandidateStudents] = useState<AssigneePickerStudentRow[]>([]);
  const [addCandidateTeams, setAddCandidateTeams] = useState<AssigneePickerTeamRow[]>([]);
  const [addCandidatesLoading, setAddCandidatesLoading] = useState(false);
  const [addBatchFilter, setAddBatchFilter] = useState('');
  const [addSelected, setAddSelected] = useState<Set<string>>(new Set());
  const [addingAssignees, setAddingAssignees] = useState(false);
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const confirm = useConfirm();

  const loadCohorts = useCallback(() => {
    return apiListCohorts().then(setCohorts).catch(() => setCohorts([]));
  }, []);

  useEffect(() => {
    loadCohorts();
  }, [loadCohorts]);

  // The cohort this page is scoped to comes from the OJT Setup shell's own
  // route (ojts/:cohortId/tasks) — CohortSectionRedirect resolves a default
  // cohort for any old flat /admin/dashboard/tasks link before landing here,
  // so by the time this component mounts the URL always names one.
  const { cohortId } = useParams<{ cohortId: string }>();
  const activeCohort = useMemo(
    () => cohorts.find(c => c.id === cohortId),
    [cohorts, cohortId]
  );

  const fetchTasksOnly = useCallback(async () => {
    setTasksLoading(true);
    try {
      const res = await apiListTasks({
        page,
        limit,
        search: search || undefined,
        cohort_id: activeCohort?.id,
        assigned_by_id: assignedById || undefined,
      });
      setTasks(res.data || []);
      setPagination(res.pagination);
      // Every row shares the same creator while this filter is active, so
      // the first row's name is enough — no separate mentor fetch needed.
      setAssignedByName(assignedById ? res.data[0]?.assigner?.full_name ?? '' : '');
    } catch (e) {
      console.error(e);
    } finally {
      setTasksLoading(false);
    }
  }, [page, limit, search, activeCohort, assignedById]);

  const clearAssignedByFilter = () => {
    setAssignedById('');
    setAssignedByName('');
    const next = new URLSearchParams(searchParams);
    next.delete('assignedById');
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (!activeCohort) return;
    fetchTasksOnly();
  }, [fetchTasksOnly, activeCohort]);

  usePageRefresh(useCallback(
    () => Promise.all([loadCohorts(), activeCohort ? fetchTasksOnly() : Promise.resolve()]),
    [loadCohorts, activeCohort, fetchTasksOnly]
  ));

  const handleLimitChange = (value: number) => {
    setPage(1);
    setLimit(value);
  };

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearchChange = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Delete this task?',
      message: 'This permanently deletes the task along with every assignee\'s submission, status history, and comments. This can\'t be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await apiDeleteTask(id);
      showSuccess('Task deleted successfully');
      fetchTasksOnly();
    } catch {
      showError('Failed to delete task');
    }
  };

  const closeEditModal = () => {
    setEditingTaskId(null);
    setEditTaskDetail(null);
    setResubmitSelected(new Set());
    setResubmitComment('');
    setAddAssigneesOpen(false);
    setAddSelected(new Set());
    setAddBatchFilter('');
  };

  const handleEditClick = async (t: ApiTask) => {
    setEditingTaskId(t.id);
    setEditTaskDetail(null);
    setEditLoading(true);
    try {
      const res = await apiGetTask(t.id);
      const full = res.data;
      setEditTaskDetail(full);
      setEditForm({
        title: full.title || '',
        description: full.description || '',
        week: full.week ? full.week.replace(/Week\s+/i, '') : '1',
        tracks: full.tracks && full.tracks.length > 0 ? full.tracks : (full.track ? [full.track] : []),
        deadline: full.deadline ? full.deadline.split('T')[0] : ''
      });
    } catch {
      showError('Failed to load task details');
      setEditingTaskId(null);
    } finally {
      setEditLoading(false);
    }
  };

  const loadAddCandidates = useCallback(async () => {
    if (!editTaskDetail) return;
    setAddCandidatesLoading(true);
    try {
      if (editTaskDetail.target_role === 'mentor') {
        // Mentor-targeted tasks don't scope by track/batch the way student
        // tasks do — the picker's own batch filter stays irrelevant here,
        // so just leave the team list empty and let the caller decide.
        setAddCandidateStudents([]);
        setAddCandidateTeams([]);
        return;
      }
      const tracksToUse = editForm.tracks.length > 0 ? editForm.tracks : [];
      if (tracksToUse.length === 0) {
        setAddCandidateStudents([]);
        setAddCandidateTeams([]);
        return;
      }
      if (editTaskDetail.assign_mode === 'team') {
        const pages = await Promise.all(
          tracksToUse.map((track) =>
            apiGetTeamsForCohortDetailed(editTaskDetail.cohort_id, {
              track,
              batch: addBatchFilter || undefined,
              status: 'published',
              limit: 200,
              skipCount: true,
            })
          )
        );
        const merged = new Map<string, AssigneePickerTeamRow>();
        pages.forEach((page) => {
          page.data.forEach((team) => {
            merged.set(team.teamId, {
              id: team.teamId,
              teamName: team.teamName,
              track: team.track,
              memberNames: team.members.map((m) => m.fullName || 'Unnamed'),
            });
          });
        });
        setAddCandidateTeams(Array.from(merged.values()));
      } else {
        const results = await Promise.all(
          tracksToUse.map((track) =>
            apiListStudents({ batch: addBatchFilter ? [addBatchFilter] : undefined, track, publishedOnly: true })
              // See CreateTaskPage's loadStudentCandidates — ApiStudent.track
              // isn't reliably populated, tag with the track this call was
              // actually scoped to.
              .then((students) => students.map((s) => ({ ...s, queriedTrack: track })))
          )
        );
        setAddCandidateStudents(
          dedupeStudentRows(
            results.flat().map((s) => ({
              id: s.id,
              fullName: s.fullName ?? null,
              batch: s.batch ?? null,
              track: s.queriedTrack,
              rollNumber: s.rollNumber ?? null,
            }))
          )
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAddCandidatesLoading(false);
    }
  }, [editTaskDetail, editForm.tracks, addBatchFilter]);

  useEffect(() => {
    if (addAssigneesOpen) loadAddCandidates();
  }, [addAssigneesOpen, loadAddCandidates]);

  const handleAddAssignees = async () => {
    if (!editTaskDetail || addSelected.size === 0) return;
    // A team-mode task assigns per-student rows fanned out from a team, and
    // apiAddTaskAssignees only takes assignee (student) ids — adding a whole
    // team here would need that fan-out resolved client-side first, which
    // isn't wired up yet. Blocked with a clear message rather than silently
    // adding nobody or crashing on a team id treated as a student id.
    if (editTaskDetail.assign_mode === 'team') {
      showError('Adding whole teams from Edit isn\'t supported yet — add the extra students individually instead.');
      return;
    }
    setAddingAssignees(true);
    try {
      const res = await apiAddTaskAssignees(editTaskDetail.id, Array.from(addSelected));
      const { added, skipped } = res.data;
      if (added.length > 0) showSuccess(`${added.length} assignee${added.length === 1 ? '' : 's'} added`);
      if (skipped.length > 0) showError(`${skipped.length} skipped: ${skipped.map((s) => s.reason).join(', ')}`);
      const refreshed = await apiGetTask(editTaskDetail.id);
      setEditTaskDetail(refreshed.data);
      setAddSelected(new Set());
      setAddAssigneesOpen(false);
      fetchTasksOnly();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to add assignees');
    } finally {
      setAddingAssignees(false);
    }
  };

  const handleRemoveAssignee = async (assignment: ApiAssignment) => {
    if (!editTaskDetail) return;
    const ok = await confirm({
      title: 'Remove assignee?',
      message: 'Their submission and status history is kept — they just stop seeing this task and drop off the assignee list. This can\'t be undone from here; add them back manually if needed.',
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;
    setRemovingAssignmentId(assignment.id);
    try {
      await apiRemoveTaskAssignment(editTaskDetail.id, assignment.id);
      showSuccess('Assignee removed');
      const refreshed = await apiGetTask(editTaskDetail.id);
      setEditTaskDetail(refreshed.data);
      setResubmitSelected((prev) => {
        const next = new Set(prev);
        next.delete(assignment.id);
        return next;
      });
      fetchTasksOnly();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to remove assignee');
    } finally {
      setRemovingAssignmentId(null);
    }
  };

  const handleBulkResubmit = async () => {
    if (!editTaskDetail || resubmitSelected.size === 0 || !resubmitComment.trim()) return;
    setBulkResubmitting(true);
    try {
      const res = await apiBulkRequestResubmit(editTaskDetail.id, Array.from(resubmitSelected), resubmitComment.trim());
      const { succeeded, skipped } = res.data;
      if (succeeded.length > 0) showSuccess(`Resubmit requested for ${succeeded.length}`);
      if (skipped.length > 0) showError(`${skipped.length} skipped: ${skipped.map((s) => s.reason).join(', ')}`);
      const refreshed = await apiGetTask(editTaskDetail.id);
      setEditTaskDetail(refreshed.data);
      setResubmitSelected(new Set());
      setResubmitComment('');
      fetchTasksOnly();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to request resubmit');
    } finally {
      setBulkResubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingTaskId) return;
    if (editForm.tracks.length === 0) {
      showError('Select at least one track');
      return;
    }
    try {
      await apiUpdateTask(editingTaskId, {
        title: editForm.title,
        description: editForm.description,
        week: `Week ${editForm.week}`,
        tracks: editForm.tracks,
        deadline: editForm.deadline ? new Date(editForm.deadline).toISOString() : undefined,
      });
      showSuccess('Task updated successfully');
      closeEditModal();
      fetchTasksOnly();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update task');
    }
  };

  const tableData = tasks
    .map(t => {
      const summary = t.assignmentsSummary;
      const totalAssignments = summary?.total ?? 0;
      const completedAssignments = summary?.byStatus.approved ?? 0;

      let aggregateStatus = 'pending';
      if (totalAssignments > 0) {
        if (completedAssignments === totalAssignments) aggregateStatus = 'approved';
        else if (summary!.byStatus.resubmit > 0) aggregateStatus = 'resubmit';
        else if (summary!.byStatus.review > 0) aggregateStatus = 'submitted';
      }

      return {
        ...t,
        aggregateStatus,
        progressText: totalAssignments > 0 ? `${completedAssignments}/${totalAssignments}` : '-'
      };
    })
    .filter(t => {
      if (roleFilter !== 'all' && t.target_role !== roleFilter) return false;
      if (statusFilter !== 'all' && t.aggregateStatus !== statusFilter) return false;
      if (assignedByFilter === 'admin' && t.assigner?.role !== 'admin' && t.assigner?.role !== 'batch_manager') return false;
      if (assignedByFilter === 'mentor' && t.assigner?.role !== 'mentor') return false;
      return true;
    });

  // The edit modal's task may belong to a different cohort than whichever
  // one the list filter currently has selected, so its batch options are
  // looked up by the task's own cohort_id, not activeCohort.
  const editCohortBatchOptions = useMemo(() => {
    const cohort = editTaskDetail ? cohorts.find(c => c.id === editTaskDetail.cohort_id) : undefined;
    return [{ value: '', label: 'All Batches' }, ...(cohort?.allowedBatches ?? []).map(b => ({ value: b, label: b }))];
  }, [cohorts, editTaskDetail]);
  // Same status palette the rest of the app uses (colour-500 at low opacity),
  // not the darker 900-based shades that read off-theme here.
  const statusConfig: Record<ApiAssignmentStatus, { label: string; icon: typeof Circle; cls: string }> = {
    pending: { label: 'Pending', icon: Circle, cls: 'text-zinc-400 bg-zinc-800 border-zinc-700' },
    review: { label: 'In Review', icon: Clock, cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
    resubmit: { label: 'Resubmit', icon: Clock, cls: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
    approved: { label: 'Approved', icon: CheckCircle2, cls: 'text-green-400 bg-green-500/10 border-green-500/20' },
  };

  return (
    <PageLayout className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {assignedById && (
            <div className="flex items-center gap-2 text-xs bg-gold/10 border border-gold/20 text-gold rounded-lg px-3 py-2 w-fit mt-2">
              <span>Showing only tasks created by {assignedByName || 'this mentor'}</span>
              <button onClick={clearAssignedByFilter} className="hover:text-white transition-colors" aria-label="Clear this filter">
                <X size={13} />
              </button>
            </div>
          )}
        </div>
        {/* Fixed-width filters so selecting a longer option (e.g. "In
            Progress") doesn't resize the control and shove the whole row
            around — the layout stays put as filters change. */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Select
            value={roleFilter}
            onChange={setRoleFilter}
            variant="filter"
            className="w-[140px]"
            options={[
              { value: 'all', label: 'All Targets' },
              { value: 'student', label: 'Students Only' },
              { value: 'mentor', label: 'Mentors Only' },
            ]}
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            variant="filter"
            className="w-[140px]"
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'pending', label: 'Pending' },
              { value: 'submitted', label: 'Submitted' },
              { value: 'resubmit', label: 'Resubmit' },
              { value: 'approved', label: 'Approved' },
            ]}
          />
          <Select
            value={assignedByFilter}
            onChange={setAssignedByFilter}
            variant="filter"
            className="w-[160px]"
            options={[
              { value: 'all', label: 'By All' },
              { value: 'admin', label: 'By Admin' },
              { value: 'mentor', label: 'By Mentor' },
            ]}
          />
          <Button onClick={() => navigate('/admin/dashboard/tasks/create')} leftIcon={<Plus size={18} />}>
            Create Task / Goal
          </Button>
        </div>
      </div>

      <DataTable
        onRowClick={(row) =>
          row.target_role === 'student' && row.category !== 'weekly_report' && cohortId
            ? onViewTaskSubmissions?.(row.id, cohortId)
            : navigate(`/admin/dashboard/ojts/${cohortId}/tasks/${row.id}`)
        }
        columns={[
          {
            key: 'week', header: 'Timeline', render: (row) => {
              // Backend data is inconsistent about the "Week " prefix and
              // its spacing ("Week 1", "Week3", ...) — pull out just the
              // number and show it as a compact W1/W2/W3, same shorthand
              // used in the Create Task form's own week picker.
              const match = row.week?.match(/\d+/);
              const label = match ? `W${match[0]}` : row.week || '-';
              return (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-300 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 whitespace-nowrap">
                  <Calendar size={11} className="text-gray-500" />
                  {label}
                </span>
              );
            }
          },
          {
            key: 'track', header: 'Tech Stack/Track', render: (row) => {
              // A task can now carry more than one track — `tracks` is the
              // real field; `track` (singular) is a transitional fallback
              // for the gap between backend/frontend deploys.
              const slugs = row.tracks && row.tracks.length > 0 ? row.tracks : (row.track ? [row.track] : []);
              if (slugs.length === 0) {
                return <span className="text-xs text-gray-500">All</span>;
              }
              return (
                <div className="flex flex-wrap gap-1">
                  {slugs.map((slug) => {
                    const label = trackNameBySlug.get(slug) ?? slug;
                    const color = getTrackColor(slug);
                    return (
                      <span key={slug} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-200 whitespace-nowrap">
                        <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                        {label}
                      </span>
                    );
                  })}
                </div>
              );
            }
          },
          {
            key: 'title', header: 'Task Title', render: (row) => (
              <span className="font-semibold text-white text-sm">{row.title}</span>
            )
          },
          {
            key: 'target_role',
            header: 'Target',
            render: (row) => {
              const isStudent = row.target_role === 'student';
              return (
                <span className="inline-flex items-center gap-1.5 text-[11px] uppercase font-bold text-gray-200">
                  <span className={`w-1.5 h-1.5 rounded-full ${isStudent ? 'bg-blue-400' : 'bg-purple-400'}`} />
                  {isStudent ? 'Student' : 'Mentor'}
                </span>
              );
            },
          },
          {
            key: 'status', header: 'Status', render: (row) => {
              const statusDots = {
                pending: 'bg-zinc-400',
                submitted: 'bg-blue-400',
                resubmit: 'bg-orange-400',
                approved: 'bg-green-500',
              };
              const dot = statusDots[row.aggregateStatus as keyof typeof statusDots] || statusDots.pending;
              const label = row.aggregateStatus.replace('_', ' ');
              return (
                <div className="flex flex-col gap-1 items-start">
                  <span className="inline-flex items-center gap-1.5 text-[11px] whitespace-nowrap uppercase font-bold text-gray-200">
                    <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                    {label}
                  </span>
                  {/* progressText counts approved assignments specifically
                      (completedAssignments above), not submitted ones — "done"
                      read as a contradiction next to a SUBMITTED badge (0/1
                      "done" looks like nothing happened even though one
                      assignee did submit). Spelling out what's actually being
                      counted removes that ambiguity. */}
                  {row.progressText !== '-' && (
                    <span className="text-[11px] text-gray-500 font-mono pl-1">{row.progressText} approved</span>
                  )}
                </div>
              );
            }
          },
          {
            key: 'assigned_by',
            header: 'Assigned By',
            render: (row) => {
              if (!row.assigner) return <span className="text-xs text-gray-500">-</span>;
              const isMentor = row.assigner.role === 'mentor';
              return (
                <div className="flex flex-col items-start gap-1">
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${
                    isMentor
                      ? 'bg-purple-500/10 text-purple-400 border-purple-500/25'
                      : 'bg-gold/10 text-gold border-gold/25'
                  }`}>
                    {isMentor ? 'Mentor' : 'Admin'}
                  </span>
                  <span className="text-xs text-gray-200 whitespace-nowrap">{row.assigner.full_name}</span>
                </div>
              );
            },
          },
          {
            key: 'assigned_names',
            header: 'Assigned To',
            render: (row) => {
              const maxDisplay = 3;
              const preview = row.assignmentsSummary?.preview ?? [];
              const total = row.assignmentsSummary?.total ?? 0;
              const displayed = preview.slice(0, maxDisplay);
              // extraCount is against the true total, not preview.length —
              // the backend only ever sends up to 5 preview rows, so this
              // must not be derived from how many names happened to arrive.
              const extraCount = total - displayed.length;

              return (
                <div className="max-w-[240px] flex flex-wrap gap-1.5 py-1">
                  {displayed.length === 0 && total === 0 && (
                    <span className="text-[11px] bg-zinc-750 text-gray-300 px-2 py-0.5 rounded border border-zinc-700 whitespace-nowrap">
                      All
                    </span>
                  )}
                  {displayed.map((a, i) => (
                    <span
                      key={i}
                      className="text-[11px] bg-zinc-750 text-gray-200 px-2 py-0.5 rounded border border-zinc-700 whitespace-nowrap truncate max-w-[110px]"
                    >
                      {a.fullName || a.assigneeId}
                    </span>
                  ))}
                  {extraCount > 0 && (
                    <span className="text-[11px] bg-zinc-800 text-gray-400 px-2 py-0.5 rounded border border-zinc-700 whitespace-nowrap">
                      +{extraCount} more
                    </span>
                  )}
                </div>
              );
            }
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
        actions={(row) => (
          <ActionsMenu
            items={[
              // A weekly report has no submission to open — what a mentor
              // sends back is the grid itself, so the first action is
              // reading every mentor's grid rather than a review queue.
              ...(row.category === 'weekly_report'
                ? [{
                    label: 'View Weekly Reports',
                    icon: ClipboardList,
                    onClick: () => navigate(`/admin/dashboard/tasks/${row.id}/weekly-report`),
                  }]
                : []),
              { label: 'Edit Task', icon: Edit2, onClick: () => handleEditClick(row) },
              { label: 'Delete Task', icon: Trash2, onClick: () => handleDelete(row.id), danger: true },
            ]}
          />
        )}
      />

      <Modal size="xl" open={!!editingTaskId} onClose={closeEditModal} title="Edit Task">
        {editLoading || !editTaskDetail ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin text-gray-500" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Read-only, for positional consistency with Create — target
                role/category are fixed at creation, changing them after
                assignees exist is structurally risky (a mentor weekly report
                vs. a student document submission are different shapes
                entirely) and isn't editable here. */}
            <div className="flex items-center gap-2 text-xs">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-semibold uppercase ${
                editTaskDetail.target_role === 'student'
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/25'
                  : 'bg-purple-500/10 text-purple-400 border-purple-500/25'
              }`}>
                {editTaskDetail.target_role === 'student' ? 'Students' : 'Mentors'}
              </span>
              <span className="px-2.5 py-1 rounded-full border border-zinc-700 bg-zinc-800 text-gray-400 font-medium">
                {editTaskDetail.category.replace('_', ' ')}
              </span>
              {editTaskDetail.assign_mode && (
                <span className="px-2.5 py-1 rounded-full border border-zinc-700 bg-zinc-800 text-gray-400 font-medium capitalize">
                  {editTaskDetail.assign_mode} submission
                </span>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Track</label>
              <Select
                isMulti
                value={editForm.tracks}
                onChange={v => setEditForm(prev => ({ ...prev, tracks: v as string[] }))}
                placeholder="Select track(s)..."
                options={trackOptions}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Title</label>
              <input
                type="text"
                value={editForm.title}
                onChange={e => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                className="w-full bg-zinc-800 text-white text-sm border border-zinc-700 rounded-lg px-3 py-2 focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Description</label>
              <textarea
                value={editForm.description}
                onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                className="w-full bg-zinc-800 text-white text-sm border border-zinc-700 rounded-lg px-3 py-2 focus:outline-none focus:border-gold h-20"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Target Week</label>
                <Select
                  value={editForm.week}
                  onChange={v => setEditForm(prev => ({ ...prev, week: v as string }))}
                  options={Array.from({ length: 12 }, (_, i) => ({ value: String(i+1), label: `Week ${i+1}` }))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Due Date</label>
                <input
                  type="date"
                  value={editForm.deadline}
                  min={editTaskDetail?.start_date ? editTaskDetail.start_date.split('T')[0] : undefined}
                  onChange={e => setEditForm(prev => ({ ...prev, deadline: e.target.value }))}
                  className="w-full bg-zinc-800 text-white text-sm border border-zinc-700 rounded-lg px-3 py-2 focus:outline-none focus:border-gold"
                />
              </div>
            </div>

            <div className="pt-1">
              <Button onClick={handleUpdate} className="w-full">
                Save Changes
              </Button>
            </div>

            {/* ── Assignees ──────────────────────────────────────────── */}
            <div className="pt-4 border-t border-zinc-750 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <User size={15} className="text-gold" />
                  Assignees ({editTaskDetail.assignments?.length ?? 0})
                </h4>
                {editTaskDetail.target_role !== 'mentor' && editTaskDetail.assign_mode !== 'team' && (
                  <button
                    type="button"
                    onClick={() => setAddAssigneesOpen((v) => !v)}
                    className="flex items-center gap-1.5 text-xs text-gold hover:text-gold-hover font-medium transition-colors"
                  >
                    <UserPlus size={14} /> {addAssigneesOpen ? 'Close' : 'Add assignees'}
                  </button>
                )}
              </div>

              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {(editTaskDetail.assignments ?? []).map((a) => {
                  const cfg = statusConfig[a.status] || statusConfig.pending;
                  return (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-3 bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2"
                    >
                      <label className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={resubmitSelected.has(a.id)}
                          disabled={a.status !== 'review'}
                          onChange={() => setResubmitSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(a.id)) next.delete(a.id);
                            else next.add(a.id);
                            return next;
                          })}
                          title={a.status !== 'review' ? 'Only assignees currently in review can be resubmitted' : 'Select for bulk resubmit'}
                          className="rounded bg-zinc-750 border-zinc-650 accent-gold focus:ring-gold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        />
                        <span className="text-sm text-white truncate">{a.assignee?.full_name || a.assignee_id}</span>
                        <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${cfg.cls}`}>
                          {cfg.label}
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRemoveAssignee(a)}
                        disabled={removingAssignmentId === a.id}
                        title="Remove from task"
                        className="shrink-0 p-1.5 text-gray-500 hover:text-red-400 transition-colors disabled:opacity-40"
                      >
                        {removingAssignmentId === a.id ? <Loader2 size={14} className="animate-spin" /> : <UserMinus size={14} />}
                      </button>
                    </div>
                  );
                })}
                {(editTaskDetail.assignments?.length ?? 0) === 0 && (
                  <p className="text-xs text-gray-500 text-center py-4">No assignees on this task.</p>
                )}
              </div>

              {/* Bulk resubmit — one shared comment for every selected
                  assignee currently in review. A checkbox is disabled for
                  anyone not in 'review' (e.g. still pending) since
                  requestResubmit can't act on them; selecting none disables
                  the button below rather than silently no-op-ing. */}
              {resubmitSelected.size > 0 && (
                <div className="bg-zinc-900/80 border border-zinc-750 rounded-lg p-3 space-y-2">
                  <label className="block text-xs text-gray-400">
                    Resubmit reason — shared across {resubmitSelected.size} selected
                  </label>
                  <textarea
                    value={resubmitComment}
                    onChange={e => setResubmitComment(e.target.value)}
                    placeholder="What needs to change..."
                    rows={2}
                    className="w-full bg-zinc-800 text-white text-sm border border-zinc-700 rounded-lg px-3 py-2 focus:outline-none focus:border-gold resize-none"
                  />
                  <Button
                    onClick={handleBulkResubmit}
                    disabled={bulkResubmitting || !resubmitComment.trim()}
                    leftIcon={bulkResubmitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    className="w-full"
                  >
                    Request Resubmit for {resubmitSelected.size} Selected
                  </Button>
                </div>
              )}

              {editTaskDetail.target_role === 'student' && editTaskDetail.assign_mode === 'team' && (
                <p className="text-[11px] text-gray-500">
                  This task assigns by whole team — add more teams from the Create flow instead.
                </p>
              )}

              {addAssigneesOpen && (
                <div className="bg-zinc-900/80 border border-zinc-750 rounded-lg p-3 space-y-3">
                  {editForm.tracks.length === 0 ? (
                    <p className="text-xs text-gray-500">Set at least one track above to see who's assignable.</p>
                  ) : (
                    <>
                      <AssigneePickerTable
                        mode="individual"
                        studentRows={addCandidateStudents.filter((s) => !(editTaskDetail.assignments ?? []).some((a) => a.assignee_id === s.id))}
                        teamRows={addCandidateTeams}
                        batchOptions={editCohortBatchOptions}
                        batchFilter={addBatchFilter}
                        onBatchFilterChange={setAddBatchFilter}
                        trackNameBySlug={trackNameBySlug}
                        selected={addSelected}
                        onSelectedChange={setAddSelected}
                        loading={addCandidatesLoading}
                      />
                      <Button
                        onClick={handleAddAssignees}
                        disabled={addingAssignees || addSelected.size === 0}
                        leftIcon={addingAssignees ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                        className="w-full"
                      >
                        Add {addSelected.size || ''} Selected
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </PageLayout>
  );
}
