import type { PrdSubmission, PrdStatus, DocumentType } from '../types';
import { apiFetch } from './client';

// Student — all PRD versions submitted for a given project allocation, latest first.
export async function apiGetPrdSubmissionsByAllocation(allocationId: string): Promise<PrdSubmission[]> {
  return apiFetch<PrdSubmission[]>(`/api/v1/allocations/${allocationId}/submissions`);
}

// Mentor/Admin/Batch Manager — every PRD submission across all allocations, for review dashboards.
export async function apiGetAllPrdSubmissions(status?: PrdStatus): Promise<PrdSubmission[]> {
  const qs = status ? `?status=${status}` : '';
  return apiFetch<PrdSubmission[]>(`/api/v1/submissions${qs}`);
}

export async function apiGetPrdSubmission(id: string): Promise<PrdSubmission> {
  return apiFetch<PrdSubmission>(`/api/v1/submissions/${id}`);
}

// Student — uploads the PDF to GCS and creates the versioned submission record in one call.
export async function apiUploadPrd(file: File, allocationId: string, docType: DocumentType = 'prd'): Promise<PrdSubmission> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('allocationId', allocationId);
  formData.append('docType', docType);
  const res = await apiFetch<{ message: string; submission: PrdSubmission }>('/api/v1/submissions/upload', {
    method: 'POST',
    body: formData,
  });
  return res.submission;
}

// Mentor/Admin — moves a PRD submission to under_review, changes_requested, or approved.
export async function apiReviewPrdSubmission(
  id: string,
  status: Extract<PrdStatus, 'under_review' | 'changes_requested' | 'approved'>,
  mentorFeedback?: string,
): Promise<PrdSubmission> {
  return apiFetch<PrdSubmission>(`/api/v1/submissions/${id}/review`, {
    method: 'POST',
    body: JSON.stringify({ status, mentorFeedback }),
  });
}

// Generates a short-lived signed URL to view/download the PRD PDF.
export async function apiGetPrdDownloadUrl(id: string): Promise<string> {
  const res = await apiFetch<{ url: string }>(`/api/v1/submissions/${id}/download-url`);
  return res.url;
}
