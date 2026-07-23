import type { PrdSubmission, PrdStatus, DocumentType } from '../types';
import { apiFetch, cachedFetch, invalidateCached } from './client';

const SUBMISSIONS_TTL = 15_000;

// Student — all PRD versions submitted for a given project allocation, latest first.
export async function apiGetPrdSubmissionsByAllocation(allocationId: string): Promise<PrdSubmission[]> {
  return cachedFetch(`submissions:byAllocation:${allocationId}`, SUBMISSIONS_TTL, () =>
    apiFetch<PrdSubmission[]>(`/api/v1/allocations/${allocationId}/submissions`)
  );
}

// Mentor/Admin/Batch Manager — every PRD submission across all allocations,
// for review dashboards. Both the admin and mentor Submissions pages
// independently fetch this whole list on mount, then filter client-side.
export async function apiGetAllPrdSubmissions(status?: PrdStatus): Promise<PrdSubmission[]> {
  const qs = status ? `?status=${status}` : '';
  return cachedFetch(`submissions:all:${status || 'all'}`, SUBMISSIONS_TTL, () =>
    apiFetch<PrdSubmission[]>(`/api/v1/submissions${qs}`)
  );
}

export async function apiGetPrdSubmission(id: string): Promise<PrdSubmission> {
  return apiFetch<PrdSubmission>(`/api/v1/submissions/${id}`);
}

// Student — uploads a file (or, for 'others', a plain text message) and
// creates the versioned submission record in one call. Pass `taskId` to link
// the submission to a specific task — the backend enforces that `docType`
// matches that task's required type and that the student is assigned to it.
export async function apiUploadPrd(params: {
  allocationId: string;
  docType: DocumentType;
  file?: File;
  message?: string;
  taskId?: string;
}): Promise<PrdSubmission> {
  const { allocationId, docType, file, message, taskId } = params;
  const formData = new FormData();
  formData.append('allocationId', allocationId);
  formData.append('docType', docType);
  if (file) formData.append('file', file);
  if (message) formData.append('message', message);
  if (taskId) formData.append('taskId', taskId);
  const res = await apiFetch<{ message: string; submission: PrdSubmission }>('/api/v1/submissions/upload', {
    method: 'POST',
    body: formData,
  });
  invalidateCached('submissions:all');
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
  invalidateCached('submissions:byAllocation');
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
