import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, CheckCircle2, Circle, Clock, ClipboardList, Eye, Loader2 } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import DataTable from '../../components/DataTable';
import Button from '../../components/Button';
import SpinnerSquare from '../../components/SpinnerSquare';
import { apiGetTask, apiApproveTask, apiRequestResubmit } from '../../lib/api/tasks';
import type { ApiTask, ApiAssignment, ApiAssignmentStatus } from '../../lib/api/tasks';
import { getTrackColor } from '../../lib/constants';
import { useTracks } from '../../hooks/useTracks';
import { useToast } from '../../toast';

interface Props {
  // Jumps to the Submissions tab with this student+task+cohort pre-selected —
  // same handoff Tasks.tsx's own list already uses, passed straight through
  // from the same place (admin/index.tsx) since this page is that list's
  // row-click destination now, not a modal it opens.
  onViewSubmission?: (studentId: string, taskId: string, cohortId: string) => void;
}

const STATUS_PILL: Record<ApiAssignmentStatus, { label: string; icon: typeof Circle; cls: string }> = {
  pending: { label: 'Pending', icon: Circle, cls: 'text-zinc-400 bg-zinc-800 border-zinc-700' },
  review: { label: 'In Review', icon: Clock, cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  resubmit: { label: 'Resubmit', icon: Clock, cls: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  approved: { label: 'Approved', icon: CheckCircle2, cls: 'text-green-400 bg-green-500/10 border-green-500/20' },
};

const STATUS_DOT: Record<ApiAssignmentStatus, string> = {
  pending: 'bg-zinc-400',
  review: 'bg-blue-400',
  resubmit: 'bg-orange-400',
  approved: 'bg-green-400',
};

const STATUS_LABEL: Record<ApiAssignmentStatus, string> = {
  pending: 'Pending',
  review: 'In Review',
  resubmit: 'Resubmit',
  approved: 'Approved',
};

/**
 * A task's own page — what used to be a "Review Assignments" modal opened
 * from the Tasks list. Moved out to a full page (same treatment as Mentor
 * Workspace) because the assignee list has no upper bound: a batch/track-wide
 * task can fan out to well over a hundred assignments, and a modal has no
 * room for the search+pagination that many rows actually need.
 */
export default function TaskDetailPage({ onViewSubmission }: Props) {
  const { cohortId, taskId } = useParams<{ cohortId: string; taskId: string }>();
  const navigate = useNavigate();
  const { showError } = useToast();
  const { tracks } = useTracks();
  const trackNameBySlug = useMemo(() => new Map(tracks.map(t => [t.slug, t.name])), [tracks]);

  const [task, setTask] = useState<ApiTask | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const res = await apiGetTask(taskId);
      setTask(res.data);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load task');
    } finally {
      setLoading(false);
    }
  }, [taskId, showError]);

  useEffect(() => { load(); }, [load]);

  const assignments = task?.assignments ?? [];
  const assignedByMentor = task?.assigner?.role === 'mentor';
  const hasStructuredContent = (task?.checklist_items?.length ?? 0) > 0 || (task?.qna_questions?.length ?? 0) > 0;
  const isWeeklyReport = task?.category === 'weekly_report';
  const taskTracks = task ? (task.tracks?.length ? task.tracks : task.track ? [task.track] : []) : [];

  // assigneeName is a flat, searchable copy of the nested assignee.full_name
  // — DataTable's searchKeys only matches top-level fields on each row.
  // Depends on `task` rather than `assignments` since the latter is a fresh
  // `?? []` array on every render and would defeat the memo entirely.
  const assignmentRows = useMemo(
    () => (task?.assignments ?? []).map(a => ({ ...a, assigneeName: a.assignee?.full_name || a.assignee_id })),
    [task]
  );

  return (
    <PageLayout mode="scroll" className="space-y-6">
      <div>
        <button
          onClick={() => navigate(`/admin/dashboard/ojts/${cohortId}/tasks`)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gold mb-2 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Tasks
        </button>
        {task && (
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-white">{task.title}</h1>
              {task.description && <p className="text-sm text-gray-400 mt-1 max-w-2xl">{task.description}</p>}
            </div>
            {isWeeklyReport && (
              <Button
                variant="secondary"
                leftIcon={<ClipboardList size={15} />}
                onClick={() => navigate(`/admin/dashboard/tasks/${task.id}/weekly-report`)}
              >
                View Weekly Reports
              </Button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : !task ? (
        <p className="text-gray-500 text-sm">Task not found.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-300 bg-zinc-850 border border-zinc-750 rounded-lg px-2.5 py-1">
              <Calendar size={12} />
              {task.week || '-'}
            </span>
            <span className="text-xs font-medium text-gray-300 bg-zinc-850 border border-zinc-750 rounded-lg px-2.5 py-1">
              Due {task.deadline ? new Date(task.deadline).toLocaleDateString() : '-'}
            </span>
            <span className="text-xs font-medium text-gray-300 bg-zinc-850 border border-zinc-750 rounded-lg px-2.5 py-1 capitalize">
              {task.category.replace(/_/g, ' ')}
            </span>
            <span className="text-xs font-medium text-gray-300 bg-zinc-850 border border-zinc-750 rounded-lg px-2.5 py-1 capitalize">
              {task.target_role} task
            </span>
            {taskTracks.map(slug => {
              const color = getTrackColor(slug);
              return (
                <span key={slug} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-300 bg-zinc-850 border border-zinc-750 rounded-lg px-2.5 py-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                  {trackNameBySlug.get(slug) ?? slug}
                </span>
              );
            })}
            {task.assigner && (
              <span className="text-xs text-gray-500">Assigned by {task.assigner.full_name}</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {(['pending', 'review', 'resubmit', 'approved'] as const).map(s => {
              const count = assignments.filter(a => a.status === s).length;
              const cfg = STATUS_PILL[s];
              const Icon = cfg.icon;
              const muted = count === 0;
              return (
                <div
                  key={s}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                    muted ? 'text-zinc-600 bg-zinc-900 border-zinc-800' : cfg.cls
                  }`}
                >
                  <Icon size={12} />
                  <span><span className="font-bold">{count}</span> {cfg.label}</span>
                </div>
              );
            })}
          </div>

          {isWeeklyReport ? (
            <p className="text-xs text-gray-400 bg-zinc-800/60 border border-zinc-750 rounded-lg px-3 py-2">
              Read and act on these from <span className="text-gold font-medium">View Weekly Reports</span> above — each mentor's grid is there, with Approve and Resubmit beside it.
            </p>
          ) : !hasStructuredContent ? (
            <p className="text-xs text-gray-400 bg-zinc-800/60 border border-zinc-750 rounded-lg px-3 py-2">
              Open a submitted row's submission below to approve or resubmit it.
            </p>
          ) : null}

          {assignedByMentor && (
            <p className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              Assigned by a mentor — admin has view-only access; only the assigning mentor or the assignee's own mentor can approve or request changes.
            </p>
          )}

          <DataTable
            columns={[
              {
                key: 'assigneeName',
                header: 'Assignee',
                render: (row) => <span className="text-sm text-gray-200">{row.assigneeName}</span>,
              },
              {
                key: 'status',
                header: 'Status',
                render: (row) => statusBadge(row.status),
              },
              {
                key: 'action',
                header: '',
                render: (row) => (
                  hasStructuredContent ? (
                    <StructuredActionCell task={task} assignment={row} onChanged={load} />
                  ) : (
                    <SimpleActionCell
                      task={task}
                      assignment={row}
                      isWeeklyReport={isWeeklyReport}
                      onViewSubmission={onViewSubmission}
                    />
                  )
                ),
              },
            ]}
            data={assignmentRows}
            searchKeys={['assigneeName']}
            searchPlaceholder="Search assignees..."
            hideExport
          />
        </>
      )}
    </PageLayout>
  );
}

function statusBadge(status: ApiAssignmentStatus) {
  return (
    <span className="text-[10px] bg-zinc-800 text-gray-300 px-2 py-0.5 rounded border border-zinc-700 whitespace-nowrap inline-flex items-center gap-1.5 w-fit">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

function SimpleActionCell({
  task,
  assignment,
  isWeeklyReport,
  onViewSubmission,
}: {
  task: ApiTask;
  assignment: ApiAssignment;
  isWeeklyReport: boolean;
  onViewSubmission?: (studentId: string, taskId: string, cohortId: string) => void;
}) {
  if (isWeeklyReport) {
    return (
      <span className="text-[11px] text-gray-500">
        {assignment.status === 'pending' ? 'Not submitted yet.' : 'Open View Weekly Reports to read this one.'}
      </span>
    );
  }

  if (assignment.status === 'pending') {
    return <span className="text-[11px] text-gray-500">Not submitted yet.</span>;
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onViewSubmission?.(assignment.assignee_id, task.id, task.cohort_id)}
        className="flex items-center gap-1.5 text-xs font-semibold text-gold hover:text-gold/80 bg-gold/10 hover:bg-gold/15 border border-gold/25 rounded-lg px-3 py-1.5 transition-colors"
      >
        <Eye size={13} />
        View Submission
      </button>
      {assignment.status === 'resubmit' && (
        <span className="text-[11px] text-gray-500 whitespace-nowrap">
          {assignment.resubmit_count} of {assignment.max_resubmit_count} resubmits used
        </span>
      )}
    </div>
  );
}

// Admin's own version of the mentor page's equivalent cell — checklist/Q&A
// tasks are admin-only to create, so admin is always the assigner here and
// always has full review rights (never the mentor-assigned view-only case).
// Collapsed, this is one line like every other row; expanding it only grows
// this one cell, not the whole row's layout.
function StructuredActionCell({
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

  if (assignment.status === 'pending') {
    return <span className="text-[11px] text-gray-500">Not submitted yet.</span>;
  }

  return (
    <div className="max-w-md">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-xs font-semibold text-gold hover:text-gold/80 transition-colors"
      >
        {expanded ? 'Hide response' : 'View response'}
      </button>

      {expanded && (
        <div className="space-y-3 mt-2 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
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
