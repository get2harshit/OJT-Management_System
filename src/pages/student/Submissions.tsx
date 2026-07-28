import { useState, useEffect, useMemo } from 'react';
import { Upload, ArrowLeft, Loader2, Users } from 'lucide-react';
import SplitPane from '../../components/SplitPane';
import RosterList from '../../components/RosterList';
import SubmissionDetail from '../../components/SubmissionDetail';
import Modal from '../../components/Modal';
import type { PrdSubmission, StudentAllocation, SubmissionKind } from '../../lib/types';
import {
  apiGetMyAllocation,
  apiGetMySubmissions,
  apiSubmitTaskWork,
  apiGetPrdDownloadUrl,
} from '../../lib/api';
import { apiListTasks } from '../../lib/api/tasks';
import type { ApiTask, ApiTaskCategory } from '../../lib/api/tasks';
import { statusDotClass } from '../../lib/submissionDisplay';

// A task's category maps to how its deliverable is submitted/rendered.
const submissionKindForCategory = (category?: ApiTaskCategory | null): SubmissionKind =>
  category === 'general' ? 'text' : category === 'link_submission' ? 'link' : 'document';

interface Props {
  studentId: string;
  initialSelectedSubId?: string | null;
  initialNewSubTaskId?: string | null;
  onClearInitialState?: () => void;
}

export default function StudentSubmissions({
  studentId,
  initialSelectedSubId,
  initialNewSubTaskId,
  onClearInitialState,
}: Partial<Props> & { studentId: string }) {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  const [allocation, setAllocation] = useState<StudentAllocation | null>(null);
  const [submissions, setSubmissions] = useState<PrdSubmission[]>([]);
  // Whether the student is in a real (>1 member) team — drives the shared
  // "Team" section. Solo / individual-OJT students don't get one. teamName is
  // the group's number (e.g. "G1"), shown as the section label.
  const [isInTeam, setIsInTeam] = useState(false);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // For general (text answer) and link (one URL per line) submissions.
  const [uploadText, setUploadText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  // Set when the upload modal was opened from a specific task's "Submit"
  // button — the submission is always for that one task, so there's no
  // document-type choice; the task's title says what's expected.
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const [myTasks, setMyTasks] = useState<ApiTask[]>([]);

  useEffect(() => {
    if (!studentId) return;
    apiListTasks().then((res) => {
      let t = Array.isArray(res) ? res : (res?.data || []);
      if (!Array.isArray(t)) t = [];
      setMyTasks(t);
    }).catch(console.error);
  }, [studentId]);

  // Every task the student has to submit something for — the left sidebar
  // browses by task (its title says what's expected). All three categories
  // (document / general-text / link) produce a submission now.
  const submittableTasks = useMemo(
    () =>
      myTasks.filter(
        (task) =>
          task.category === 'document_submission' ||
          task.category === 'general' ||
          task.category === 'link_submission'
      ),
    [myTasks]
  );

  // A task belongs in the shared "Team" section only when the student is
  // actually in a real team AND the task was assigned in team mode — a solo
  // student's team-mode task (assigned to their one-person team) still reads
  // as their own individual work.
  const isTeamTask = (task: ApiTask) => isInTeam && task.assign_mode === 'team';
  const mySubmittableTasks = useMemo(() => submittableTasks.filter((t) => !isTeamTask(t)), [submittableTasks, isInTeam]);
  const teamSubmittableTasks = useMemo(() => submittableTasks.filter((t) => isTeamTask(t)), [submittableTasks, isInTeam]);

  // One scoped call for the whole list — own submissions + shared team
  // submissions + whether a Team section applies.
  const loadSubmissions = async () => {
    const { isInTeam: inTeam, teamName: tName, submissions: subs } = await apiGetMySubmissions();
    setSubmissions(subs);
    setIsInTeam(inTeam);
    setTeamName(tName);
  };

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      // The submission list (team-aware) is independent of the allocation
      // lookup — one failing must not blank the other.
      const submissionsPromise = loadSubmissions().catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load submissions');
      });
      try {
        // Allocation is still needed as the upload target — a student uploads
        // under their own allocation.
        const myAllocation = await apiGetMyAllocation();
        if (!cancelled) setAllocation(myAllocation);
      } catch {
        // A 404 here just means "not allocated yet" — not a real error.
        if (!cancelled) setAllocation(null);
      }
      await submissionsPromise;
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  useEffect(() => {
    if (initialSelectedSubId) {
      setSelectedSubId(initialSelectedSubId);
      onClearInitialState?.();
    }
  }, [initialSelectedSubId, onClearInitialState]);

  // Keeps the left-side task selection in sync when a submission is opened
  // directly (e.g. from a task's "View Submission" button).
  useEffect(() => {
    if (!selectedSubId) return;
    const sub = submissions.find((s) => s.id === selectedSubId);
    if (sub?.taskId) setSelectedTaskId(sub.taskId);
  }, [selectedSubId, submissions]);

  // Opened from a task's Submit button — the submission is for that one task,
  // so there's nothing to choose: just point the modal at it and open. (No
  // task_type lookup anymore — the task title is what says what's expected.)
  useEffect(() => {
    if (!initialNewSubTaskId) return;
    setActiveTaskId(initialNewSubTaskId);
    setSelectedTaskId(initialNewSubTaskId);
    setUploadModalOpen(true);
    onClearInitialState?.();
  }, [initialNewSubTaskId, onClearInitialState]);

  const taskSubmissions = submissions.filter((s) => s.taskId === selectedTaskId);
  const selectedTask = submittableTasks.find((t) => t.id === selectedTaskId);
  const selectedTaskIsTeam = selectedTask ? isTeamTask(selectedTask) : false;
  const activeSub = submissions.find((s) => s.id === selectedSubId);
  // Legacy rows have no submissionType but are always documents.
  const activeSubKind: SubmissionKind = activeSub?.submissionType ?? 'document';

  useEffect(() => {
    // Only a document submission has a stored file to generate a viewer URL
    // for — text/link submissions carry their content inline.
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

  // The active task the modal is submitting for (may differ from selectedTask
  // only briefly while opening) — drives which input the modal shows.
  const activeTask = submittableTasks.find((t) => t.id === activeTaskId);
  const activeKind = submissionKindForCategory(activeTask?.category);
  const canUpload =
    !!allocation && (activeKind === 'document' ? !!selectedFile : !!uploadText.trim());

  const closeUploadModal = () => {
    setUploadModalOpen(false);
    setSelectedFile(null);
    setUploadText('');
    setActiveTaskId(null);
  };

  const handleUpload = async () => {
    if (!allocation || !canUpload || !activeTaskId) return;
    setUploading(true);
    setError(null);
    try {
      await apiSubmitTaskWork({
        allocationId: allocation.id,
        submissionType: activeKind,
        taskId: activeTaskId,
        file: activeKind === 'document' ? selectedFile ?? undefined : undefined,
        content: activeKind === 'document' ? undefined : uploadText.trim(),
      });
      await loadSubmissions();
      closeUploadModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setUploading(false);
    }
  };

  const ASSIGNMENT_STATUS_LABEL: Record<string, string> = {
    pending: 'Pending',
    review: 'In Review',
    resubmit: 'Resubmit requested',
    approved: 'Done',
  };

  const toRosterItem = (task: ApiTask, section?: string) => {
    const status = task.myAssignment?.status;
    return {
      id: task.id,
      primaryLabel: task.title,
      secondaryLabel: status ? (ASSIGNMENT_STATUS_LABEL[status] ?? status) : 'Not assigned',
      badge: submissions.filter((s) => s.taskId === task.id).length,
      done: status === 'approved',
      section,
    };
  };

  // Only split into sections when there's actually a Team group to show —
  // solo students keep a flat, unlabelled list.
  const teamSectionLabel = teamName ? `Team ${teamName}` : 'Team';
  const rosterItems = isInTeam
    ? [
        ...mySubmittableTasks.map((t) => toRosterItem(t, 'My Submissions')),
        ...teamSubmittableTasks.map((t) => toRosterItem(t, teamSectionLabel)),
      ]
    : submittableTasks.map((t) => toRosterItem(t));

  const selectTask = (id: string) => {
    setSelectedTaskId(id);
    setSelectedSubId(null);
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold text-white">My Submissions</h1>
        {/* Submissions are always started from the Tasks tab's Submit button —
            this page is for viewing and tracking them, so there's no manual
            "New Submission" here anymore. */}
        <p className="text-gray-400 text-sm mt-1">Track your submitted documents — submit new ones from the Tasks tab.</p>
      </div>

      {error && (
        <div className="shrink-0 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-2.5">{error}</div>
      )}

      <SplitPane
        sidebarCollapsed={!!activeSub}
        sidebar={
          <RosterList
            items={rosterItems}
            selectedId={selectedTaskId}
            onSelect={selectTask}
            searchPlaceholder="Search tasks..."
          />
        }
      >
        {!allocation ? (
          <div className="h-full flex items-center justify-center text-center px-6">
            <p className="text-gray-500 text-sm">
              You don't have a project allocation yet — submissions open once you're allocated to a project.
            </p>
          </div>
        ) : !selectedTaskId ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
            Select a task to view your submissions.
          </div>
        ) : activeSub ? (
          <div className="space-y-0">
            <div className="px-6 pt-6">
              <button
                onClick={() => setSelectedSubId(null)}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-850 text-gray-300 rounded-lg hover:text-white hover:bg-zinc-750 transition-all text-sm font-semibold border border-zinc-700"
              >
                <ArrowLeft size={16} />
                Back to {selectedTask?.title ?? 'task'} submissions
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
              viewerUrl={viewerUrl}
              downloading={downloadingId === activeSub.id}
              downloadError={downloadError}
              onDownload={handleDownload}
            />
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-white">{selectedTask?.title}</h2>
              {selectedTaskIsTeam && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gold/10 text-gold border border-gold/25">
                  <Users size={11} />
                  {teamName ? `Team ${teamName}` : 'Team'}
                </span>
              )}
            </div>
            {selectedTaskIsTeam && (
              <p className="text-xs text-gray-500 -mt-2">
                Shared with your team — any member can submit, and everyone sees the same submission.
              </p>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={22} className="animate-spin text-gray-500" />
              </div>
            ) : taskSubmissions.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-10">No submissions for this task yet.</p>
            ) : (
              <div className="space-y-2">
                {taskSubmissions.map((sub) => {
                  const style = statusDotClass(sub.status);
                  return (
                    <button
                      key={sub.id}
                      onClick={() => setSelectedSubId(sub.id)}
                      className="w-full flex items-center justify-between gap-3 bg-zinc-900 border border-zinc-750 hover:border-zinc-600 rounded-lg px-4 py-3 transition-colors text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">Version {sub.versionNumber}</p>
                        <p className="text-xs text-gray-500">
                          {sub.updatedAt.slice(0, 10)}
                          {selectedTaskIsTeam && sub.submitterName && <> · by {sub.submitterName}</>}
                        </p>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium shrink-0 ${style.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                        {sub.status.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </SplitPane>

      <Modal open={uploadModalOpen} onClose={closeUploadModal} title={activeTask ? `Submit: ${activeTask.title}` : 'Submit'}>
        <div className="space-y-4">
          {!allocation ? (
            <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm rounded-lg px-3 py-2.5">
              You don't have a project allocation yet — submissions open once you're allocated to a project.
            </div>
          ) : !activeTask ? (
            // The task list is still resolving — hold the input until we know
            // the task's category, so the wrong input never flashes.
            <div className="flex items-center justify-center py-8">
              <Loader2 size={22} className="animate-spin text-gray-500" />
            </div>
          ) : (
            <>
              {/* The input depends on the task's category — the title already
                  says what's expected, so there's no type picker. */}
              {activeKind === 'document' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Document (PDF)</label>
                  <label className="border-2 border-dashed border-zinc-750 rounded-lg p-6 text-center hover:border-gold/40 transition-colors block cursor-pointer">
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                    />
                    <Upload size={24} className="mx-auto text-gray-500 mb-2" />
                    <p className="text-sm text-gray-500">
                      {selectedFile ? selectedFile.name : 'Click to select a PDF'}
                    </p>
                  </label>
                </div>
              )}
              {activeKind === 'text' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Your answer</label>
                  <textarea
                    value={uploadText}
                    onChange={(e) => setUploadText(e.target.value)}
                    placeholder="Write your answer…"
                    rows={6}
                    className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold transition-colors resize-none"
                  />
                </div>
              )}
              {activeKind === 'link' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Link(s)</label>
                  <textarea
                    value={uploadText}
                    onChange={(e) => setUploadText(e.target.value)}
                    placeholder={'https://your-deployed-app.com\nhttps://github.com/your/repo'}
                    rows={4}
                    className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold transition-colors resize-none"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">One URL per line (deployed app, repo, demo…).</p>
                </div>
              )}
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                onClick={handleUpload}
                disabled={!canUpload || uploading}
                className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50 disabled:hover:bg-gold flex items-center justify-center gap-2"
              >
                {uploading && <Loader2 size={16} className="animate-spin" />}
                {uploading ? 'Submitting…' : 'Submit'}
              </button>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
