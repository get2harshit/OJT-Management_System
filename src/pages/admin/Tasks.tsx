import { useState, useEffect } from 'react';
import { Plus, Trash2, Calendar, Edit2, User, CheckCircle2, Clock, Circle, ChevronRight, ClipboardCheck, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DataTable from '../../components/DataTable';
import { apiListTasks, apiDeleteTask, apiUpdateTask, apiApproveTask, apiRequestResubmit } from '../../lib/api/tasks';
import type { ApiTask, ApiAssignment, ApiAssignmentStatus } from '../../lib/api/tasks';
import Button from '../../components/Button';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import ActionsMenu from '../../components/ActionsMenu';
import { TRACKS } from '../../lib/constants';
import { useToast } from '../../toast';

interface Assignee {
  id: string;
  name: string;
  role: string;
  tasks: Array<{ taskId: string; taskTitle: string; week: string; status: ApiAssignmentStatus; deadline?: string }>;
}

export default function AdminTasks() {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingTask, setEditingTask] = useState<ApiTask | null>(null);
  const [reviewTask, setReviewTask] = useState<ApiTask | null>(null);

  const [progressModalOpen, setProgressModalOpen] = useState(false);
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

  const buildAssigneeMap = () => {
    const map = new Map<string, Assignee>();
    tasks.forEach(task => {
      (task.assignments || []).forEach(a => {
        const id = a.assignee_id;
        const name = a.assignee ? a.assignee.full_name : a.assignee_id;
        const role = a.assignee ? a.assignee.role : 'unknown';
        if (!map.has(id)) {
          map.set(id, { id, name, role, tasks: [] });
        }
        map.get(id)!.tasks.push({
          taskId: task.id,
          taskTitle: task.title,
          week: task.week || '-',
          status: a.status,
          deadline: task.deadline || undefined,
        });
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  };

  const openProgressModal = (initialAssigneeId?: string) => {
    const assignees = buildAssigneeMap();
    setAllAssignees(assignees);
    setSelectedAssigneeId(initialAssigneeId || (assignees[0]?.id ?? null));
    setProgressModalOpen(true);
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
      let assignedNames = ['All'];
      let totalAssignments = 0;
      let completedAssignments = 0;
      
      if (t.assignments && t.assignments.length > 0) {
        assignedNames = t.assignments.map(a => a.assignee ? a.assignee.full_name : a.assignee_id);
        totalAssignments = t.assignments.length;
        completedAssignments = t.assignments.filter(a => a.status === 'approved').length;
      }

      let aggregateStatus = 'pending';
      if (totalAssignments > 0) {
        if (completedAssignments === totalAssignments) aggregateStatus = 'approved';
        else if (t.assignments!.some(a => a.status === 'review' || a.status === 'resubmit')) aggregateStatus = 'in_progress';
      }

      return { 
        ...t, 
        assigned_names: assignedNames,
        aggregateStatus,
        progressText: totalAssignments > 0 ? `${completedAssignments}/${totalAssignments}` : '-'
      };
    })
    .filter(t => {
      if (roleFilter !== 'all' && t.target_role !== roleFilter) return false;
      if (statusFilter !== 'all' && t.aggregateStatus !== statusFilter) return false;
      return true;
    });

  const selectedAssignee = allAssignees.find(a => a.id === selectedAssigneeId);
  const statusConfig: Record<ApiAssignmentStatus, { label: string; icon: typeof Circle; cls: string }> = {
    pending: { label: 'Pending', icon: Circle, cls: 'text-zinc-400 bg-zinc-800 border-zinc-700' },
    review: { label: 'In Review', icon: Clock, cls: 'text-blue-400 bg-blue-900/20 border-blue-800' },
    resubmit: { label: 'Resubmit', icon: Clock, cls: 'text-orange-400 bg-orange-900/20 border-orange-800' },
    approved: { label: 'Approved', icon: CheckCircle2, cls: 'text-green-400 bg-green-900/20 border-green-800' },
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Week-wise Goals & Tasks</h1>
          <p className="text-gray-400 text-sm mt-1">Map out structured goals, viva checkpoints, and sub-tasks for each tech stack track</p>
        </div>
        <div className="flex items-center gap-3">
          <Select 
            value={roleFilter} 
            onChange={setRoleFilter} 
            variant="filter"
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
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'pending', label: 'Pending' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'approved', label: 'Approved' },
            ]}
          />
          <Button
            onClick={() => openProgressModal()}
            leftIcon={<User size={16} />}
            variant="ghost"
            className="hover:scale-105 border border-zinc-700 text-gray-300"
          >
            Progress Board
          </Button>
          <Button onClick={() => navigate('/admin/dashboard/tasks/create')} leftIcon={<Plus size={18} />} className="hover:scale-105">
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
            key: 'track', header: 'Tech Stack/Track', render: (row) => (
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-gray-300 font-medium border border-zinc-700">
                {row.track || 'All'}
              </span>
            )
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
                <span className={`inline-flex items-center gap-1.5 text-[10px] uppercase font-bold ${isStudent ? 'text-blue-400' : 'text-purple-400'}`}>
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
                  <span className={`inline-flex items-center gap-1.5 text-[10px] whitespace-nowrap uppercase font-bold ${style.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                    {label}
                  </span>
                  {row.progressText !== '-' && (
                    <span className="text-[10px] text-gray-500 font-mono pl-1">{row.progressText} done</span>
                  )}
                </div>
              );
            }
          },
          { 
            key: 'assigned_names', 
            header: 'Assigned To',
            render: (row) => {
              const maxDisplay = 3;
              const names: string[] = row.assigned_names || [];
              const assignmentList = row.assignments || [];
              const displayNames = names.slice(0, maxDisplay);
              const extraCount = names.length - maxDisplay;
              
              return (
                <div className="max-w-[220px] flex flex-wrap gap-1.5 py-1">
                  {displayNames.map((name: string, i: number) => {
                    const assignment = assignmentList[i];
                    const assigneeId = assignment?.assignee_id;
                    return (
                      <span 
                        key={i} 
                        className="text-[10px] bg-zinc-800 text-gray-300 px-2 py-0.5 rounded border border-zinc-700 whitespace-nowrap truncate max-w-[100px] cursor-pointer hover:bg-gold/10 hover:text-gold hover:border-gold/30 transition-colors" 
                        title={`Click to view ${name}'s progress`}
                        onClick={() => openProgressModal(assigneeId)}
                      >
                        {name}
                      </span>
                    );
                  })}
                  {extraCount > 0 && (
                    <span 
                      className="text-[10px] bg-zinc-800/50 text-gray-400 px-2 py-0.5 rounded border border-zinc-800 whitespace-nowrap cursor-pointer hover:bg-gold/10 hover:text-gold hover:border-gold/30 transition-colors"
                      title={names.slice(maxDisplay).join(', ')}
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
        actions={(row) => (
          <ActionsMenu
            items={[
              // Document-category tasks are reviewed from the Submissions
              // page instead — this is only for general/link_submission
              // tasks, which have no submission record to review there.
              ...(row.category !== 'document_submission' && (row.assignments?.length ?? 0) > 0
                ? [{ label: 'Review Assignments', icon: ClipboardCheck, onClick: () => setReviewTask(row) }]
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
                options={TRACKS.map(t => ({ value: t, label: t }))}
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
        {allAssignees.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No assignment data found.</p>
        ) : (
          <div className="flex gap-0 h-[65vh] -mx-6 -mb-6 overflow-hidden rounded-b-xl">

            {/* Left sidebar: assignee list */}
            <div className="w-60 shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col">
              {/* Role tabs */}
              <div className="px-2 pt-3 pb-2">
                <div className="flex gap-1 bg-zinc-800/80 rounded-lg p-1">
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
            <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
              {selectedAssignee ? (
                <>
                  {/* Header */}
                  <div className="px-6 py-4 border-b border-zinc-800 flex items-center gap-4 bg-zinc-900/50">
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
                    {/* Quick stat pills */}
                    <div className="ml-auto flex gap-3">
                      {(['pending', 'review', 'resubmit', 'approved'] as const).map(s => {
                        const count = selectedAssignee.tasks.filter(t => t.status === s).length;
                        const cfg = statusConfig[s];
                        const Icon = cfg.icon;
                        return (
                          <div key={s} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${cfg.cls}`}>
                            <Icon size={13} />
                            <span>{count} {cfg.label}</span>
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
                            className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4 hover:border-zinc-600 transition-colors group"
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

      <Modal open={!!reviewTask} onClose={() => setReviewTask(null)} title="Review Assignments">
        {reviewTask && (
          <AdminAssigneeReviewPanel
            task={reviewTask}
            onChanged={async () => {
              await fetchTasksOnly();
              setReviewTask(prev => (prev ? tasks.find(t => t.id === prev.id) ?? prev : prev));
            }}
          />
        )}
      </Modal>
    </div>
  );
}

// Admin/batch_manager can always approve or request a resubmit, regardless
// of who created the task (backend's assigned_by_id-or-admin check) — only
// used for general/link_submission tasks; document tasks are reviewed from
// the Submissions page instead.
function AdminAssigneeReviewPanel({
  task,
  onChanged,
}: {
  task: ApiTask;
  onChanged: () => Promise<void>;
}) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [resubmitDraft, setResubmitDraft] = useState<Record<string, string>>({});
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

      <div className="space-y-3">
        {assignments.map(assignment => {
          const saving = savingId === assignment.id;
          return (
            <div key={assignment.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-200 truncate">{assignment.assignee?.full_name || assignment.assignee_id}</span>
                <span className="text-[10px] bg-zinc-800 text-gray-300 px-2 py-0.5 rounded border border-zinc-700 whitespace-nowrap flex items-center gap-1.5 w-fit">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot[assignment.status]}`} />
                  {statusLabel[assignment.status]}
                </span>
              </div>

              {assignment.status === 'review' && (
                <div className="space-y-2">
                  <textarea
                    value={resubmitDraft[assignment.id] || ''}
                    onChange={e => setResubmitDraft(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                    placeholder="Resubmit comment (required to send back for resubmission)"
                    rows={2}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-gold transition-colors resize-none"
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
