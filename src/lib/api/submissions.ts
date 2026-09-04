import type { PrdSubmission, PrdStatus, SubmissionKind } from '../types';
import { apiFetch, cachedFetch, invalidateCached } from './client';

const SUBMISSIONS_TTL = 15_000;

// Student — all PRD versions submitted for a given project allocation, latest first.
export async function apiGetPrdSubmissionsByAllocation(allocationId: string): Promise<PrdSubmission[]> {
  return cachedFetch(`submissions:byAllocation:${allocationId}`, SUBMISSIONS_TTL, () =>
    apiFetch<PrdSubmission[]>(`/api/v1/allocations/${allocationId}/submissions`)
  );
}

export interface MySubmissions {
  // Whether the student is in a real (>1 member) team — gates the "Team"
  // section. Solo / individual-OJT students don't get one.
  isInTeam: boolean;
  // The team's name/number (e.g. "G1"), shown as the Team section label.
  teamName: string | null;
  submissions: PrdSubmission[];
}

// Student — their own submissions plus any shared team submissions (a
// teammate's upload on a team-assigned task), in one scoped call. Replaces
// the per-allocation fetch on the student Submissions page so team work is
// visible to every member.
export async function apiGetMySubmissions(): Promise<MySubmissions> {
  return cachedFetch('submissions:my', SUBMISSIONS_TTL, () =>
    apiFetch<MySubmissions>('/api/v1/submissions/my')
  );
}

// Mentor/Admin/Batch Manager — every PRD submission across all allocations,
// for review dashboards. Kept for callers that genuinely need the whole set;
// the admin/mentor review roster now fetches per-student on click instead
// (apiGetSubmissionsByStudent) rather than pulling everything up front. The
// admin Submissions page's CSV export is the one caller that still wants the
// whole set — scoped down to one cohort so it isn't the whole system's.
export async function apiGetAllPrdSubmissions(
  status?: PrdStatus,
  cohortId?: string,
  includeDownloadUrls?: boolean
): Promise<PrdSubmission[]> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (cohortId) params.set('cohortId', cohortId);
  // Opt-in only — signs a 7-day download link per document submission
  // server-side, so skip it (and its cache) unless the caller (the CSV
  // export) actually wants it.
  if (includeDownloadUrls) params.set('includeDownloadUrls', 'true');
  const qs = params.toString();
  return cachedFetch(
    `submissions:all:${status || 'all'}:${cohortId || 'any'}:${includeDownloadUrls ? 'withUrls' : 'noUrls'}`,
    SUBMISSIONS_TTL,
    () => apiFetch<PrdSubmission[]>(`/api/v1/submissions${qs ? `?${qs}` : ''}`)
  );
}

// Mentor/Admin/Batch Manager — one clicked student's submissions only. The
// backend scopes by studentId and, for a mentor, enforces they actually
// mentor that student — so no over-fetching the whole system and filtering
// client-side.
export async function apiGetSubmissionsByStudent(studentId: string): Promise<PrdSubmission[]> {
  return cachedFetch(`submissions:byStudent:${studentId}`, SUBMISSIONS_TTL, () =>
    apiFetch<PrdSubmission[]>(`/api/v1/submissions?studentId=${studentId}`)
  );
}

export async function apiGetPrdSubmission(id: string): Promise<PrdSubmission> {
  return apiFetch<PrdSubmission>(`/api/v1/submissions/${id}`);
}

// Student — submits a task's deliverable and creates the versioned record in
// one call. The shape depends on the task's category:
//   document → a `file` (PDF)
//   text     → `content` (a written answer)
//   link     → `content` (one or more URLs, newline-separated)
// `taskId` links it to the task; the backend transitions that task to review.
export async function apiSubmitTaskWork(params: {
  allocationId: string;
  submissionType: SubmissionKind;
  taskId: string;
  file?: File;
  content?: string;
}): Promise<PrdSubmission> {
  const { allocationId, submissionType, file, content, taskId } = params;
  const formData = new FormData();
  formData.append('allocationId', allocationId);
  formData.append('submissionType', submissionType);
  formData.append('taskId', taskId);
  if (file) formData.append('file', file);
  if (content) formData.append('content', content);
  const res = await apiFetch<{ message: string; submission: PrdSubmission }>('/api/v1/submissions/upload', {
    method: 'POST',
    body: formData,
  });
  invalidateCached('submissions:all');
  invalidateCached('submissions:byStudent');
  invalidateCached('submissions:my');
  invalidateCached(`submissions:byAllocation:${allocationId}`);
  // A task-linked upload also auto-transitions that task's assignment status
  // server-side (see SubmissionService.syncAssignmentStatus) — the task
  // caches would otherwise show a stale pre-submission status.
  if (taskId) {
    invalidateCached('tasks:list');
    invalidateCached(`tasks:get:${taskId}`);
  }
  return res.submission;
}

// Mentor/Admin — moves a PRD submission to under_review, changes_requested, or approved.
export async function apiReviewPrdSubmission(
  id: string,
  status: Extract<PrdStatus, 'under_review' | 'changes_requested' | 'approved'>,
  mentorFeedback?: string,
): Promise<PrdSubmission> {
  const res = await apiFetch<PrdSubmission>(`/api/v1/submissions/${id}/review`, {
    method: 'POST',
    body: JSON.stringify({ status, mentorFeedback }),
  });
  invalidateCached('submissions:all');
  invalidateCached('submissions:byStudent');
  invalidateCached('submissions:my');
  invalidateCached('submissions:byAllocation');
  // The mentor submissions roster caches each mentee's pending-review count
  // (teams:mine:detailed:counts) — a review changes it, so drop that too or
  // the badge would stay stale for the cache's TTL after reviewing.
  invalidateCached('teams:mine:detailed');
  // A review decision also drives the linked task's assignment status
  // (approved/resubmit) — invalidate broadly since the task id isn't known
  // here, only the submission id.
  invalidateCached('tasks:list');
  return res;
}

// Generates a short-lived signed URL to view/download the PRD PDF.
export async function apiGetPrdDownloadUrl(id: string): Promise<string> {
  const res = await apiFetch<{ url: string }>(`/api/v1/submissions/${id}/download-url`);
  return res.url;
}

// Admin-only — reopens an approved submission back to under_review.
// 'approved' is otherwise a locked, one-way state; this is the only way to
// undo a mentor's mistaken approval short of an engineer editing the
// database directly.
export async function apiRevertPrdApproval(id: string): Promise<PrdSubmission> {
  const res = await apiFetch<PrdSubmission>(`/api/v1/submissions/${id}/revert-approval`, {
    method: 'POST',
  });
  invalidateCached('submissions:all');
  invalidateCached('submissions:byStudent');
  invalidateCached('submissions:my');
  invalidateCached('submissions:byAllocation');
  invalidateCached('teams:mine:detailed');
  invalidateCached('tasks:list');
  return res;
}
