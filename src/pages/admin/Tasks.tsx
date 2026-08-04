import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Plus, Trash2, Calendar, Edit2, User, CheckCircle2, Clock, Circle, ChevronRight, ClipboardCheck, Loader2, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DataTable from '../../components/DataTable';
import PageLayout from '../../components/PageLayout';
import { apiListTasks, apiGetTask, apiDeleteTask, apiUpdateTask, apiGetAssigneeProgress, apiApproveTask, apiRequestResubmit } from '../../lib/api/tasks';
import type { ApiTask, ApiAssignment, ApiAssignmentStatus } from '../../lib/api/tasks';
import Button from '../../components/Button';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import ActionsMenu from '../../components/ActionsMenu';
import { getTrackColor } from '../../lib/constants';
import { useTracks } from '../../hooks/useTracks';
import { useToast } from '../../toast';
import { apiListCohorts } from '../../lib/api';
import { getCohortLabel } from '../../lib/cohortLabel';
import type { Cohort } from '../../lib/types';
import { useAuth } from '../../context/useAuth';
import { usePageRefresh } from '../../context/RefreshContext';

interface Assignee {
  id: string;
  name: string;
  role: string;
  tasks: Array<{ taskId: string; taskTitle: string; week: string; status: ApiAssignmentStatus; deadline?: string }>;
}

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

interface Props {
  // Jumps to the Submissions tab with this student+task+cohort pre-selected,
  // so an assignee row can be reviewed from the real submission detail
  // instead of the old blind Approve/Resubmit buttons here.
  onViewSubmission?: (studentId: string, taskId: string, cohortId: string) => void;
}

export default function AdminTasks({ onViewSubmission }: Props = {}) {
  const { user } = useAuth();
  const myId = user?.id;
  const { tracks, options: trackOptions } = useTracks();
  const trackNameBySlug = useMemo(() => new Map(tracks.map(t => [t.slug, t.name])), [tracks]);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
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
  // 'me' = tasks this admin personally created, 'mentor' = created by any
  // mentor (mentors can create tasks for their own students too) — same
  // client-side-over-current-page approach as roleFilter/statusFilter above.
  const [assignedByFilter, setAssignedByFilter] = useState('all');
  const [editingTask, setEditingTask] = useState<ApiTask | null>(null);
  // The list response only carries assignmentsSummary (a capped preview),
  // never the full per-assignee list — reviewTaskId drives the modal's
  // open state, reviewTask holds the full detail fetched on demand via
  // apiGetTask once the admin actually opens it.
  const [reviewTaskId, setReviewTaskId] = useState<string | null>(null);
  const [reviewTask, setReviewTask] = useState<ApiTask | null>(null);
  const [reviewTaskLoading, setReviewTaskLoading] = useState(false);

  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [progressModalLoading, setProgressModalLoading] = useState(false);
  const [allAssignees, setAllAssignees] = useState<Assignee[]>([]);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string | null>(null);
  const [boardRoleFilter, setBoardRoleFilter] = useState<'all' | 'student' | 'mentor'>('all');

  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    week: '1',
    track: '',
    deadline: ''
  });
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();

  const loadCohorts = useCallback(() => {
    return apiListCohorts().then(setCohorts).catch(() => setCohorts([]));
  }, []);

  useEffect(() => {
    loadCohorts();
  }, [loadCohorts]);

  // Defaults to the active cohort once cohorts load (same fallback
  // CreateTaskPage.tsx uses), but — unlike before — the admin can now
  // switch to any other cohort via the selector below instead of being
  // silently locked to whichever one auto-detected as "active".
  const [selectedCohortId, setSelectedCohortId] = useState('');
  useEffect(() => {
    if (selectedCohortId || cohorts.length === 0) return;
    const active = cohorts.find(c => c.isActive) || cohorts[0];
    if (active) setSelectedCohortId(active.id);
  }, [cohorts, selectedCohortId]);

  // Admins have no ojt_cohort_members row of their own (only students/
  // mentors do), so the backend can't infer "their" cohort on its own.
  const activeCohort = useMemo(
    () => cohorts.find(c => c.id === selectedCohortId),
    [cohorts, selectedCohortId]
  );

  const fetchTasksOnly = useCallback(async () => {
    try {
      const res = await apiListTasks({ page, limit, search: search || undefined, cohort_id: activeCohort?.id });
      setTasks(res.data || []);
      setPagination(res.pagination);
    } catch (e) {
      console.error(e);
    }
  }, [page, limit, search, activeCohort]);

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

  // The Progress Board aggregates every assignee across *all* tasks in the
  // cohort, not just the current page — fetched separately on demand from a
  // dedicated backend aggregation endpoint rather than pulling every task's
  // full record (description, category, statusHistory, etc.) via
  // apiListTasks({ limit: 1000 }) just to throw most of it away here.
  const openProgressModal = async (initialAssigneeId?: string) => {
    setProgressModalOpen(true);
    setProgressModalLoading(true);
    try {
      if (!activeCohort) throw new Error('No active cohort');
      const assignees = await apiGetAssigneeProgress(activeCohort.id);
      setAllAssignees(assignees.map(a => ({
        id: a.id,
        name: a.name || a.id,
        role: a.role,
        tasks: a.tasks.map(t => ({
          taskId: t.taskId,
          taskTitle: t.taskTitle,
          week: t.week || '-',
          status: t.status,
          deadline: t.deadline || undefined,
        })),
      })));
      setSelectedAssigneeId(initialAssigneeId || (assignees[0]?.id ?? null));
    } catch (e) {
      console.error(e);
      showError('Failed to load progress board');
    } finally {
      setProgressModalLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiDeleteTask(id);
      showSuccess('Task deleted successfully');
      fetchTasksOnly();
    } catch {
      showError('Failed to delete task');
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

  const handleEditClick = (t: ApiTask) => {
    setEditingTask(t);
    setEditForm({
      title: t.title || '',
      description: t.description || '',
      week: t.week ? t.week.replace(/Week\s+/i, '') : '1',
      track: t.track || '',
      deadline: t.deadline ? t.deadline.split('T')[0] : ''
    });
  };

  const handleUpdate = async () => {
    if (!editingTask) return;
    try {
      await apiUpdateTask(editingTask.id, {
        title: editForm.title,
        description: editForm.description,
        week: `Week ${editForm.week}`,
        track: editForm.track,
        deadline: editForm.deadline ? new Date(editForm.deadline).toISOString() : undefined,
      });
      showSuccess('Task updated successfully');
      setEditingTask(null);
      fetchTasksOnly();
    } catch {
      showError('Failed to update task');
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
        else if ((summary!.byStatus.review + summary!.byStatus.resubmit) > 0) aggregateStatus = 'in_progress';
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
      if (assignedByFilter === 'me' && t.assigned_by_id !== myId) return false;
      if (assignedByFilter === 'mentor' && t.assigner?.role !== 'mentor') return false;
      return true;
    });

  const selectedAssignee = allAssignees.find(a => a.id === selectedAssigneeId);
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
          <h1 className="text-2xl font-bold text-white">Week-wise Goals & Tasks</h1>
          <p className="text-gray-400 text-sm mt-1">Map out structured goals, viva checkpoints, and sub-tasks for each tech stack track</p>
        </div>
        {/* Fixed-width filters so selecting a longer option (e.g. "In
            Progress") doesn't resize the control and shove the whole row
            around — the layout stays put as filters change. */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Select
            value={selectedCohortId}
            onChange={(v) => { setPage(1); setSelectedCohortId(v as string); }}
            variant="filter"
            placeholder="Select cohort"
            className="w-[168px]"
            options={cohorts.map(c => ({ value: c.id, label: getCohortLabel(c) }))}
          />
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
              { value: 'in_progress', label: 'In Progress' },
              { value: 'approved', label: 'Approved' },
            ]}
          />
          <Select
            value={assignedByFilter}
            onChange={setAssignedByFilter}
            variant="filter"
            className="w-[160px]"
            options={[
              { value: 'all', label: 'Assigned by anyone' },
              { value: 'me', label: 'Assigned by me' },
              { value: 'mentor', label: 'Assigned by mentor' },
            ]}
          />
          <Button
            onClick={() => openProgressModal()}
            leftIcon={<User size={16} />}
            variant="secondary"
          >
            Progress Board
          </Button>
          <Button onClick={() => navigate('/admin/dashboard/tasks/create')} leftIcon={<Plus size={18} />}>
            Create Task / Goal
          </Button>
        </div>
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
            key: 'track', header: 'Tech Stack/Track', render: (row) => {
              if (!row.track) {
                return <span className="text-xs text-gray-500">All</span>;
              }
              // The row carries the track slug (e.g. product_development) —
              // resolve it to the readable name + the same track colour used
              // everywhere else, instead of showing the snake_case string.
              const label = trackNameBySlug.get(row.track) ?? row.track;
              const color = getTrackColor(row.track);
              return (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-200 whitespace-nowrap">
                  <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                  {label}
                </span>
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
                <span className={`inline-flex items-center gap-1.5 text-[11px] uppercase font-bold ${isStudent ? 'text-blue-400' : 'text-purple-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isStudent ? 'bg-blue-400' : 'bg-purple-400'}`} />
                  {isStudent ? 'Student' : 'Mentor'}
                </span>
              );
            },
          },
          {
            key: 'status', header: 'Status', render: (row) => {
              const statusDots = {
                pending: { dot: 'bg-zinc-400', text: 'text-zinc-400' },
                in_progress: { dot: 'bg-blue-400', text: 'text-blue-400' },
                approved: { dot: 'bg-green-500', text: 'text-green-500' },
              };
              const style = statusDots[row.aggregateStatus as keyof typeof statusDots] || statusDots.pending;
              const label = row.aggregateStatus.replace('_', ' ');
              return (
                <div
                  className="flex flex-col gap-1 items-start cursor-pointer hover:opacity-80 group"
                  onClick={() => openProgressModal()}
                  title="Click to view detailed progress"
                >
                  <span className={`inline-flex items-center gap-1.5 text-[11px] whitespace-nowrap uppercase font-bold ${style.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                    {label}
                  </span>
                  {row.progressText !== '-' && (
                    <span className="text-[11px] text-gray-500 font-mono pl-1">{row.progressText} done</span>
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
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-200 whitespace-nowrap">
                  {row.assigner.full_name}
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${
                    isMentor
                      ? 'bg-purple-500/10 text-purple-400 border-purple-500/25'
                      : 'bg-gold/10 text-gold border-gold/25'
                  }`}>
                    {isMentor ? 'Mentor' : 'Admin'}
                  </span>
                </span>
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
                      className="text-[11px] bg-zinc-750 text-gray-200 px-2 py-0.5 rounded border border-zinc-700 whitespace-nowrap truncate max-w-[110px] cursor-pointer hover:bg-gold/10 hover:text-gold hover:border-gold/30 transition-colors"
                      title={`Click to view ${a.fullName || a.assigneeId}'s progress`}
                      onClick={() => openProgressModal(a.assigneeId)}
                    >
                      {a.fullName || a.assigneeId}
                    </span>
                  ))}
                  {extraCount > 0 && (
                    <span
                      className="text-[11px] bg-zinc-800 text-gray-400 px-2 py-0.5 rounded border border-zinc-700 whitespace-nowrap cursor-pointer hover:bg-gold/10 hover:text-gold hover:border-gold/30 transition-colors"
                      onClick={() => openProgressModal()}
                    >
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
        actions={(row) => (
          <ActionsMenu
            items={[
              // Every category (document/general/link) now submits real
              // content through the Submissions tab — this panel just opens
              // the assignee list and routes each one there to review.
              ...((row.assignmentsSummary?.total ?? 0) > 0
                ? [{ label: 'Review Assignments', icon: ClipboardCheck, onClick: () => openReviewModal(row.id) }]
                : []),
              { label: 'Edit Task', icon: Edit2, onClick: () => handleEditClick(row) },
              { label: 'Delete Task', icon: Trash2, onClick: () => handleDelete(row.id), danger: true },
            ]}
          />
        )}
      />

      <Modal open={!!editingTask} onClose={() => setEditingTask(null)} title="Edit Task">
        <div className="space-y-4">
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
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Track</label>
              <Select 
                value={editForm.track}
                onChange={v => setEditForm(prev => ({ ...prev, track: v as string }))}
                placeholder="All Tracks"
                options={trackOptions}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Due Date</label>
            <input 
              type="date" 
              value={editForm.deadline} 
              onChange={e => setEditForm(prev => ({ ...prev, deadline: e.target.value }))}
              className="w-full bg-zinc-800 text-white text-sm border border-zinc-700 rounded-lg px-3 py-2 focus:outline-none focus:border-gold" 
            />
          </div>
          
          <div className="pt-2">
            <Button onClick={handleUpdate} className="w-full">
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Assignee Progress Board Modal ─────────────────────────────── */}
      <Modal size="xl" open={progressModalOpen} onClose={() => setProgressModalOpen(false)} title="Assignee Progress Board">
        {progressModalLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin text-gray-500" />
          </div>
        ) : allAssignees.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No assignment data found.</p>
        ) : (
          <div className="flex gap-0 h-[65vh] -mx-6 -mb-6 overflow-hidden rounded-b-xl">

            {/* Left sidebar: assignee list */}
            <div className="w-60 shrink-0 bg-zinc-900 border-r border-zinc-750 flex flex-col">
              {/* Role tabs */}
              <div className="px-2 pt-3 pb-2">
                <div className="flex gap-1 bg-zinc-800 rounded-lg p-1">
                  {(['all', 'student', 'mentor'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => {
                        setBoardRoleFilter(r);
                        // auto-select first matching assignee
                        const first = allAssignees.find(a => r === 'all' || a.role === r || (r === 'student' && a.role === 'student') || (r === 'mentor' && a.role === 'mentor'));
                        if (first) setSelectedAssigneeId(first.id);
                      }}
                      className={`flex-1 text-[10px] font-semibold uppercase py-1 rounded-md transition-all ${
                        boardRoleFilter === r
                          ? 'bg-zinc-700 text-white shadow'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {r === 'all' ? 'All' : r === 'student' ? 'Students' : 'Mentors'}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold mt-2 px-1">
                  {allAssignees.filter(a => boardRoleFilter === 'all' || a.role === boardRoleFilter).length} assignees
                </p>
              </div>
              <div className="space-y-0.5 px-2 pb-3 flex-1 overflow-y-auto">
                {allAssignees
                  .filter(a => boardRoleFilter === 'all' || a.role === boardRoleFilter)
                  .map(a => {
                  const total = a.tasks.length;
                  const done  = a.tasks.filter(t => t.status === 'approved').length;
                  const wip   = a.tasks.filter(t => t.status === 'review' || t.status === 'resubmit').length;
                  const isSelected = a.id === selectedAssigneeId;
                  return (
                    <button
                      key={a.id}
                      onClick={() => setSelectedAssigneeId(a.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center justify-between gap-2 group ${
                        isSelected
                          ? 'bg-gold/10 border border-gold/25 text-white'
                          : 'hover:bg-zinc-800 text-gray-400 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          isSelected
                            ? (a.role === 'mentor' ? 'bg-purple-500 text-white' : 'bg-blue-500 text-white')
                            : 'bg-zinc-700 text-gray-300 group-hover:bg-zinc-600'
                        }`}>
                          {a.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-xs font-medium truncate ${isSelected ? 'text-white' : 'text-gray-300'}`}>{a.name}</p>
                          <p className="text-[10px] text-zinc-500 capitalize">{a.role}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end shrink-0 gap-0.5">
                        <span className="text-[10px] text-zinc-500 font-mono">{done}/{total}</span>
                        {wip > 0 && <span className="text-[9px] text-blue-400 font-bold">{wip} WIP</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right panel: selected assignee's tasks */}
            <div className="flex-1 flex flex-col overflow-hidden bg-zinc-900">
              {selectedAssignee ? (
                <>
                  {/* Header */}
                  <div className="px-6 py-4 border-b border-zinc-750 flex items-center gap-4 bg-zinc-850/50">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-bold ${
                      selectedAssignee.role === 'mentor'
                        ? 'bg-purple-500/20 border border-purple-500/40 text-purple-300'
                        : 'bg-blue-500/20 border border-blue-500/40 text-blue-300'
                    }`}>
                      {selectedAssignee.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-white font-semibold text-base">{selectedAssignee.name}</h3>
                        <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                          selectedAssignee.role === 'mentor'
                            ? 'bg-purple-500/10 text-purple-400 border-purple-500/25'
                            : 'bg-blue-500/10 text-blue-400 border-blue-500/25'
                        }`}>
                          {selectedAssignee.role === 'mentor' ? 'Mentor' : 'Student'}
                        </span>
                      </div>
                      <p className="text-zinc-500 text-xs mt-0.5">
                        {selectedAssignee.tasks.length} task{selectedAssignee.tasks.length !== 1 ? 's' : ''} assigned
                      </p>
                    </div>
                    {/* Quick stat pills — a zero-count status is muted so the
                        eye lands on what actually needs attention. */}
                    <div className="ml-auto flex gap-2">
                      {(['pending', 'review', 'resubmit', 'approved'] as const).map(s => {
                        const count = selectedAssignee.tasks.filter(t => t.status === s).length;
                        const cfg = statusConfig[s];
                        const Icon = cfg.icon;
                        const muted = count === 0;
                        return (
                          <div
                            key={s}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                              muted ? 'text-zinc-600 bg-zinc-850 border-zinc-750' : cfg.cls
                            }`}
                          >
                            <Icon size={12} />
                            <span><span className="font-bold">{count}</span> {cfg.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Task list */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-3">
                    {selectedAssignee.tasks.length === 0 ? (
                      <p className="text-zinc-500 text-sm text-center mt-8">No tasks assigned.</p>
                    ) : (
                      selectedAssignee.tasks.map((task, idx) => {
                        const cfg = statusConfig[task.status] || statusConfig.pending;
                        const Icon = cfg.icon;
                        return (
                          <div
                            key={idx}
                            className="flex items-center justify-between bg-zinc-850 border border-zinc-750 rounded-xl px-5 py-4 hover:border-gold/30 transition-colors group"
                          >
                            <div className="flex items-center gap-4 min-w-0">
                              <Icon size={18} className={cfg.cls.split(' ')[0]} strokeWidth={2} />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-white truncate group-hover:text-gold transition-colors">
                                  {task.taskTitle}
                                </p>
                                <p className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-1">
                                  <Calendar size={10} />
                                  {task.week}
                                  {task.deadline && <> · Due {new Date(task.deadline).toLocaleDateString()}</>}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-4 shrink-0">
                              <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border ${cfg.cls}`}>
                                {cfg.label}
                              </span>
                              <ChevronRight size={14} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-zinc-500 text-sm">Select an assignee to view their tasks.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!reviewTaskId}
        onClose={() => { setReviewTaskId(null); setReviewTask(null); }}
        title="Review Assignments"
      >
        {reviewTaskLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={28} className="animate-spin text-gray-500" />
          </div>
        ) : reviewTask ? (
          <AdminAssigneeReviewPanel
            task={reviewTask}
            onViewSubmission={onViewSubmission}
            onChanged={async () => {
              await openReviewModal(reviewTask.id);
              await fetchTasksOnly();
            }}
          />
        ) : null}
      </Modal>
    </PageLayout>
  );
}

// Every document/general/link category task submits real content through
// the Submissions tab, so this panel never approves/resubmits blind for
// those — it only routes to the actual submission. A mentor-targeted
// checklist/Q&A task has no document/submission at all though, so those are
// reviewed right here instead (checked-items + answers, then Approve/
// Resubmit) — admin is the one who assigned it in that case (checklist/Q&A
// tasks are admin-only to create), so admin always has full review rights
// on them, unlike the mentor-assigned-task view-only case below.
function AdminAssigneeReviewPanel({
  task,
  onViewSubmission,
  onChanged,
}: {
  task: ApiTask;
  onViewSubmission?: (studentId: string, taskId: string, cohortId: string) => void;
  onChanged?: () => Promise<void>;
}) {
  const assignments = task.assignments || [];
  const assignedByMentor = task.assigner?.role === 'mentor';
  const hasStructuredContent = (task.checklist_items?.length ?? 0) > 0 || (task.qna_questions?.length ?? 0) > 0;

  const statusDot: Record<ApiAssignmentStatus, string> = {
    pending: 'bg-zinc-400',
    review: 'bg-blue-400',
    resubmit: 'bg-orange-400',
    approved: 'bg-green-400',
  };
  const statusLabel: Record<ApiAssignmentStatus, string> = {
    pending: 'Pending',
    review: 'In Review',
    resubmit: 'Resubmit',
    approved: 'Approved',
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-white font-semibold">{task.title}</h4>
        {task.description && <p className="text-gray-400 text-sm mt-1">{task.description}</p>}
      </div>

      {!hasStructuredContent && (
        <p className="text-xs text-gray-400 bg-zinc-800/60 border border-zinc-750 rounded-lg px-3 py-2">
          Open a submitted row's submission below to approve or resubmit it.
        </p>
      )}

      {assignedByMentor && (
        <p className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          Assigned by a mentor — admin has view-only access; only the assigning mentor or the assignee's own mentor can approve or request changes.
        </p>
      )}

      <div className="space-y-3">
        {assignments.map(assignment => (
          hasStructuredContent ? (
            <AdminStructuredAssignmentReviewRow
              key={assignment.id}
              task={task}
              assignment={assignment}
              onChanged={onChanged}
            />
          ) : (
            <div key={assignment.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-200 truncate">{assignment.assignee?.full_name || assignment.assignee_id}</span>
                <span className="text-[10px] bg-zinc-800 text-gray-300 px-2 py-0.5 rounded border border-zinc-700 whitespace-nowrap flex items-center gap-1.5 w-fit">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot[assignment.status]}`} />
                  {statusLabel[assignment.status]}
                </span>
              </div>

              {assignment.status !== 'pending' ? (
                <button
                  onClick={() => onViewSubmission?.(assignment.assignee_id, task.id, task.cohort_id)}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-gold hover:text-gold/80 bg-gold/10 hover:bg-gold/15 border border-gold/25 rounded-lg py-2 transition-colors"
                >
                  <Eye size={13} />
                  View Submission
                </button>
              ) : (
                <p className="text-[11px] text-gray-500">Not submitted yet.</p>
              )}

              {assignment.status === 'resubmit' && (
                <p className="text-[11px] text-gray-500">
                  {assignment.resubmit_count} of {assignment.max_resubmit_count} resubmits used
                </p>
              )}
            </div>
          )
        ))}
      </div>
    </div>
  );
}

// Admin's own version of the mentor page's equivalent row — checklist/Q&A
// tasks are admin-only to create, so admin is always the assigner here and
// always has full review rights (never the mentor-assigned view-only case).
function AdminStructuredAssignmentReviewRow({
  task,
  assignment,
  onChanged,
}: {
  task: ApiTask;
  assignment: ApiAssignment;
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

  const statusDot: Record<ApiAssignmentStatus, string> = {
    pending: 'bg-zinc-400',
    review: 'bg-blue-400',
    resubmit: 'bg-orange-400',
    approved: 'bg-green-400',
  };
  const statusLabel: Record<ApiAssignmentStatus, string> = {
    pending: 'Pending',
    review: 'In Review',
    resubmit: 'Resubmit',
    approved: 'Approved',
  };

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
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 space-y-2.5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <span className="text-sm text-gray-200 truncate">{assignment.assignee?.full_name || assignment.assignee_id}</span>
        <span className="text-[10px] bg-zinc-800 text-gray-300 px-2 py-0.5 rounded border border-zinc-700 whitespace-nowrap flex items-center gap-1.5 w-fit">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot[assignment.status]}`} />
          {statusLabel[assignment.status]}
        </span>
      </button>

      {assignment.status === 'pending' && (
        <p className="text-[11px] text-gray-500">Not submitted yet.</p>
      )}

      {expanded && assignment.status !== 'pending' && (
        <div className="space-y-3 pt-1">
          {checklistItems.map(item => (
            <label key={item.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-zinc-850 border border-zinc-750">
              <input type="checkbox" checked={!!checklistAnswers[item.id]} disabled className="accent-gold w-4 h-4 shrink-0 opacity-80" />
              <span className="text-sm text-gray-300">{item.label}</span>
            </label>
          ))}
          {qnaQuestions.map(q => (
            <div key={q.id}>
              <p className="text-xs text-gray-500 mb-1">{q.question}</p>
              <p className="text-sm text-gray-200 bg-zinc-850 border border-zinc-750 rounded-lg px-3 py-2 whitespace-pre-wrap">
                {qnaAnswers[q.id] || <span className="text-gray-600">No answer</span>}
              </p>
            </div>
          ))}

          {assignment.status === 'review' && (
            <div className="space-y-2 pt-1">
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Optional comment (required for resubmit)"
                rows={2}
                className="w-full bg-zinc-850 border border-zinc-750 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold transition-colors resize-none placeholder-gray-500"
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
