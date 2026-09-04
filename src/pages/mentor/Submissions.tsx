import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, Loader2, Users } from 'lucide-react';
import SplitPane from '../../components/SplitPane';
import RosterList from '../../components/RosterList';
import SubmissionDetail from '../../components/SubmissionDetail';
import ReviewActions from '../../components/ReviewActions';
import type { PrdSubmission, SubmissionKind } from '../../lib/types';
import { DOCUMENT_TYPE_LABELS } from '../../lib/types';
import { apiGetSubmissionsByStudent, apiGetPrdDownloadUrl, apiReviewPrdSubmission } from '../../lib/api';
import { apiGetMyRoster } from '../../lib/api/teamRoster';
import { apiGetTask } from '../../lib/api/tasks';
import type { ApiTask, ApiAssignmentStatus } from '../../lib/api/tasks';
import { statusDotClass, submissionStatusLabel } from '../../lib/submissionDisplay';
import { useToast } from '../../toast';
import { usePageRefresh } from '../../context/RefreshContext';
import { useConfirm } from '../../confirm';

const ASSIGNMENT_STATUS_LABEL: Record<ApiAssignmentStatus, string> = {
  pending: 'Pending',
  review: 'In Review',
  resubmit: 'Resubmit',
  approved: 'Approved',
};

interface Props {
  // Set by the Tasks tab's "View Submission" action to jump straight to a
  // specific student's submission for a given task, instead of the mentor
  // having to find it manually. onFocusHandled clears it once consumed so a
  // later manual visit to this tab (via the sidebar) doesn't re-trigger it.
  focusStudentId?: string | null;
  focusTaskId?: string | null;
  // Set by Tasks' row click on a student-targeted task (just the task, no
  // specific student) — scopes the roster below to that task's own
  // assignees instead of the mentor's full mentee list. Independent of
  // focusStudentId/focusTaskId above: this is "browse everyone on this
  // task", not "jump to one specific submission".
  focusTaskOnly?: string | null;
  onFocusHandled?: () => void;
}

type Row = PrdSubmission & { studentId: string };

interface Mentee {
  studentId: string;
  fullName: string;
  rollNumber: string;
  track: string;
  pendingReviewCount: number;
}

// mentorId is gone as a prop: the roster read is scoped to the authenticated
// caller and the OJT in the URL, so there is no id for a parent to pass in.
export default function MentorSubmissions({
  focusStudentId,
  focusTaskId,
  focusTaskOnly,
  onFocusHandled,
}: Partial<Props>) {
  // The OJT this review roster is scoped to, from the route.
  const { cohortId } = useParams<{ cohortId: string }>();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const confirm = useConfirm();

  const [mentees, setMentees] = useState<Mentee[]>([]);
  // Only the clicked student's submissions — fetched per-student, backend
  // already restricts a mentor to their own mentees.
  const [studentSubmissions, setStudentSubmissions] = useState<Row[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Keyed by taskId when a submission is linked to one, else a synthetic
  // `type:<documentType>` key for older/unlinked submissions — a task's
  // title is what identifies a submission now, not a fixed document-type
  // enum, so filtering groups by task rather than by type.
  const [taskFilter, setTaskFilter] = useState<string>('ALL');

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  // Set once from focusTaskOnly and then lives on its own — not derived from
  // that prop on every render, since the parent nulls it out right after
  // (via onFocusHandled) so a later manual tab visit doesn't re-trigger it,
  // and re-deriving from a nulled prop would clear this the moment it did.
  // "Back to my roster" clears it directly.
  const [taskScope, setTaskScope] = useState<ApiTask | null>(null);
  const [taskScopeLoading, setTaskScopeLoading] = useState(false);

  const [reviewing, setReviewing] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  // The mentee roster for this OJT, with each one's pending-review count,
  // from the same roster read the rest of My OJT uses. It used to call
  // /teams/my-teams/detailed, which spans every OJT the mentor has ever had
  // and resolves teams by a different rule — two sources for "my students"
  // on one hub is exactly how the roster and Teams sections once ended up
  // contradicting each other on screen.
  const loadRoster = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    setError(null);
    try {
      const roster = await apiGetMyRoster(cohortId);
      const trackByTeam = new Map(roster.teams.map((t) => [t.id, t.track]));
      setMentees(
        roster.students
          .map((student) => ({
            studentId: student.id,
            fullName: student.fullName || student.id,
            rollNumber: student.rollNumber || '-',
            track: (student.teamId ? trackByTeam.get(student.teamId) : null) ?? '-',
            pendingReviewCount: student.submissionsPending,
          }))
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  }, [cohortId]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  usePageRefresh(() => Promise.all([
    loadRoster(),
    selectedStudentId ? loadStudentSubmissions(selectedStudentId) : Promise.resolve(),
    taskScope ? apiGetTask(taskScope.id).then((res) => setTaskScope(res.data)) : Promise.resolve(),
  ]));

  const loadStudentSubmissions = async (studentId: string) => {
    setSubmissionsLoading(true);
    try {
      const subs = await apiGetSubmissionsByStudent(studentId);
      const rows = subs.map((s) => ({ ...s, studentId }));
      setStudentSubmissions(rows);
      return rows;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load submissions');
      setStudentSubmissions([]);
      return [];
    } finally {
      setSubmissionsLoading(false);
    }
  };

  // Waits for the roster to finish loading (so selectedStudent resolves to a
  // real mentee) before jumping to the requested student+task, then picks
  // the latest version of that task's submission to open directly.
  useEffect(() => {
    if (!focusStudentId || loading) return;
    if (!mentees.some((m) => m.studentId === focusStudentId)) return;

    setSelectedStudentId(focusStudentId);
    setSelectedSubId(null);
    setTaskFilter('ALL');
    setStudentSubmissions([]);

    loadStudentSubmissions(focusStudentId).then((rows) => {
      if (focusTaskId) {
        const matches = rows.filter((r) => r.taskId === focusTaskId);
        const latest = matches.sort((a, b) => b.versionNumber - a.versionNumber)[0];
        if (latest) {
          setTaskFilter(latest.taskId ?? `type:${latest.documentType}`);
          setSelectedSubId(latest.id);
        }
      }
      onFocusHandled?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusStudentId, focusTaskId, loading, mentees]);

  // Loads the task itself (title + every one of its assignees, with each
  // one's own status) so the sidebar can list just this task's assignees —
  // not filtered down to mentees, since a task's own assigner can review
  // any of its assignees, not only the ones currently on this mentor's
  // roster (e.g. a student reassigned to another mentor since).
  useEffect(() => {
    if (!focusTaskOnly) return;
    let cancelled = false;
    setTaskScopeLoading(true);
    setSelectedStudentId(null);
    setSelectedSubId(null);
    setStudentSubmissions([]);
    apiGetTask(focusTaskOnly)
      .then((res) => { if (!cancelled) setTaskScope(res.data); })
      .catch(() => { if (!cancelled) setError('Failed to load that task'); })
      .finally(() => {
        if (cancelled) return;
        setTaskScopeLoading(false);
        // Only now, not before starting the fetch — onFocusHandled nulls
        // focusTaskOnly in the parent, which re-runs this same effect and
        // sets `cancelled` on this run via the cleanup below. Calling it
        // any earlier would cancel the very fetch it's meant to follow.
        onFocusHandled?.();
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTaskOnly]);

  const taskScopeRosterItems = useMemo(
    () =>
      (taskScope?.assignments ?? []).map((a) => ({
        id: a.assignee_id,
        primaryLabel: a.assignee?.full_name || a.assignee_id,
        secondaryLabel: ASSIGNMENT_STATUS_LABEL[a.status],
        done: a.status === 'approved',
      })),
    [taskScope]
  );

  const rosterItems = useMemo(
    () =>
      mentees.map((m) => ({
        id: m.studentId,
        primaryLabel: m.fullName,
        secondaryLabel: `${m.rollNumber} · ${m.track}`,
        badge: m.pendingReviewCount,
      })),
    [mentees]
  );

  const selectedStudent = mentees.find((m) => m.studentId === selectedStudentId);
  // Falls back to the task-scope assignee's own name when the selected
  // person isn't (or isn't currently) one of this mentor's mentees — the
  // task's own assignee list still has it even when the roster doesn't.
  const selectedTaskAssignee = taskScope?.assignments?.find((a) => a.assignee_id === selectedStudentId);
  const selectedName = selectedStudent?.fullName ?? selectedTaskAssignee?.assignee?.full_name ?? selectedStudentId ?? '';
  const submissionTaskKey = (r: Row) => r.taskId ?? `type:${r.documentType}`;
  const submissionTaskLabel = (r: Row) => r.taskTitle ?? DOCUMENT_TYPE_LABELS[r.documentType];
  const taskFilterOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of studentSubmissions) {
      const key = submissionTaskKey(r);
      if (!seen.has(key)) seen.set(key, submissionTaskLabel(r));
    }
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentSubmissions]);
  // In task scope, every row already belongs to that one task — the normal
  // taskFilter pills would be redundant (and taskFilter itself is left at
  // 'ALL' when entering this mode).
  const studentRows = studentSubmissions.filter(
    (r) => (taskScope ? r.taskId === taskScope.id : taskFilter === 'ALL' || submissionTaskKey(r) === taskFilter)
  );
  const activeSub = studentSubmissions.find((r) => r.id === selectedSubId);
  const activeSubKind: SubmissionKind = activeSub?.submissionType ?? 'document';

  useEffect(() => {
    // Only a document submission has a stored file to view.
    if (!activeSub || activeSubKind !== 'document') {
      setViewerUrl(null);
      return;
    }
    let cancelled = false;
    apiGetPrdDownloadUrl(activeSub.id)
      .then((url) => { if (!cancelled) setViewerUrl(url); })
      .catch(() => { if (!cancelled) setViewerUrl(null); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSub?.id]);

  const handleDownload = async () => {
    if (!activeSub) return;
    setDownloadError(null);
    setDownloadingId(activeSub.id);
    try {
      const url = await apiGetPrdDownloadUrl(activeSub.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Failed to generate download link');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleReview = async (status: 'changes_requested' | 'approved', feedback?: string) => {
    if (!activeSub) return;
    if (status === 'approved') {
      // Approved is a locked, one-way state — only an admin can reopen it
      // from here, and only via a separate action. Worth a deliberate
      // confirmation given how often an accidental click here has happened.
      const ok = await confirm({
        title: 'Approve this submission?',
        message: "Once approved, the student can't resubmit and only an admin can reopen it for review. This can't be undone from here.",
        confirmLabel: 'Approve',
        variant: 'default',
      });
      if (!ok) return;
    }
    setReviewing(true);
    try {
      await apiReviewPrdSubmission(activeSub.id, status, feedback);
      showSuccess(status === 'approved' ? 'Submission approved.' : 'Resubmit requested — the student has been notified.');
      // Refresh this student's submissions and the roster badge — not everyone's.
      await Promise.all([
        selectedStudentId ? loadStudentSubmissions(selectedStudentId) : Promise.resolve(),
        loadRoster(),
      ]);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update review');
    } finally {
      setReviewing(false);
    }
  };

  const selectStudent = (id: string) => {
    setSelectedStudentId(id);
    setSelectedSubId(null);
    setTaskFilter('ALL');
    setStudentSubmissions([]);
    loadStudentSubmissions(id);
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="shrink-0">
        {taskScope ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-white">{taskScope.title}</h1>
              <p className="text-gray-400 text-sm mt-1">Everyone assigned this task — click a name to review their submission.</p>
            </div>
            <button
              onClick={() => navigate(`/mentor/dashboard/ojts/${cohortId}/tasks`)}
              className="flex items-center gap-2 px-3 py-1.5 bg-zinc-850 text-gray-300 rounded-lg hover:text-white hover:bg-zinc-750 transition-all text-sm font-semibold border border-zinc-700 shrink-0"
            >
              <ArrowLeft size={16} />
              Back to Task
            </button>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-white">Submissions</h1>
            <p className="text-gray-400 text-sm mt-1">Review and manage your students' submissions</p>
          </>
        )}
      </div>

      {error && (
        <div className="shrink-0 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-2.5">{error}</div>
      )}

      <SplitPane
        sidebarCollapsed={!!activeSub}
        sidebar={
          <RosterList
            items={taskScope ? taskScopeRosterItems : rosterItems}
            selectedId={selectedStudentId}
            onSelect={selectStudent}
            searchPlaceholder={taskScope ? 'Search assignees...' : 'Search your students...'}
            loading={taskScope ? taskScopeLoading : loading}
            emptyMessage={taskScope ? 'No one has been assigned this task yet.' : 'No students assigned to you yet.'}
          />
        }
      >
        {!selectedStudentId ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
            {taskScope ? 'Select an assignee to view their submission.' : 'Select a student to view their submissions.'}
          </div>
        ) : activeSub ? (
          <div className="space-y-0">
            <div className="px-6 pt-6">
              <button
                onClick={() => setSelectedSubId(null)}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 text-gray-300 rounded-lg hover:text-white hover:bg-zinc-700 transition-all text-sm font-semibold border border-zinc-700"
              >
                <ArrowLeft size={16} />
                Back to {selectedName}'s submissions
              </button>
            </div>
            <SubmissionDetail
              status={activeSub.status}
              submissionKind={activeSubKind}
              versionNumber={activeSub.versionNumber}
              updatedAt={activeSub.updatedAt}
              documentLink={activeSub.documentLink}
              messageContent={activeSub.messageContent}
              mentorFeedback={activeSub.mentorFeedback}
              reviewedByName={activeSub.reviewedByName}
              viewerUrl={viewerUrl}
              downloading={downloadingId === activeSub.id}
              downloadError={downloadError}
              onDownload={handleDownload}
              headerExtra={
                <p className="text-xs text-gray-500 mt-1">
                  {selectedName}
                  {selectedStudent && <> ({selectedStudent.rollNumber}) · {selectedStudent.track}</>}
                </p>
              }
              reviewControls={
                <ReviewActions
                  disabled={reviewing || activeSub.status === 'approved'}
                  onApprove={() => handleReview('approved')}
                  onRequestChanges={(feedback) => handleReview('changes_requested', feedback)}
                />
              }
            />
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">{selectedName}</h2>
              {selectedStudent && (
                <p className="text-xs text-gray-500">
                  {selectedStudent.rollNumber} · {selectedStudent.track}
                </p>
              )}
            </div>

            {/* Only meaningful when browsing a student's whole submission
                history — every row is already this one task's in task
                scope, so the filter would just be a single redundant pill. */}
            {!taskScope && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setTaskFilter('ALL')}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${taskFilter === 'ALL' ? 'border-gold text-gold bg-gold/10' : 'border-zinc-700 text-gray-400 hover:border-zinc-600'}`}
                >
                  All
                </button>
                {taskFilterOptions.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setTaskFilter(key)}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${taskFilter === key ? 'border-gold text-gold bg-gold/10' : 'border-zinc-700 text-gray-400 hover:border-zinc-600'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {submissionsLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={22} className="animate-spin text-gray-500" />
              </div>
            ) : studentRows.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-10">No submissions from this student yet.</p>
            ) : (
              <div className="space-y-2">
                {studentRows.map((row) => {
                  const style = statusDotClass(row.status);
                  return (
                    <button
                      key={row.id}
                      onClick={() => setSelectedSubId(row.id)}
                      className="w-full flex items-center justify-between gap-3 bg-zinc-900 border border-zinc-750 hover:border-zinc-600 rounded-lg px-4 py-3 transition-colors text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate flex items-center gap-2">
                          <span className="truncate">{submissionTaskLabel(row)} · v{row.versionNumber}</span>
                          {row.isTeam && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gold/10 text-gold border border-gold/25 shrink-0">
                              <Users size={10} />
                              {row.teamName ? `Team ${row.teamName}` : 'Team'}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">
                          {row.updatedAt.slice(0, 10)}
                          {row.isTeam && row.submitterName && <> · by {row.submitterName}</>}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                          {submissionStatusLabel(row.status).toUpperCase()}
                        </span>
                        <Eye size={16} className="text-gray-500" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </SplitPane>
    </div>
  );
}
