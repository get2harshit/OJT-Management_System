import { apiFetch } from './client';
import type { EligibilityStatus, EligibilityStatusInput } from '../types';

export interface EligibilityStatusesPage {
  data: EligibilityStatus[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

// Admin-only platform-access gate roster — server-paginated and searched,
// same shape as every other admin list (see feedback_no_overfetch_backend_filters).
export async function apiListEligibilityStatuses(params: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<EligibilityStatusesPage> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.search) query.set('search', params.search);
  const qs = query.toString();
  return apiFetch<EligibilityStatusesPage>(`/api/v1/eligibility${qs ? `?${qs}` : ''}`);
}

export async function apiUpdateEligibilityStatus(
  id: string,
  input: Partial<EligibilityStatusInput>
): Promise<EligibilityStatus> {
  const { data } = await apiFetch<{ data: EligibilityStatus }>(`/api/v1/eligibility/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return data;
}

export async function apiDeleteEligibilityStatus(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/eligibility/${id}`, { method: 'DELETE' });
}

// One CSV row from the bulk upload — resolved server-side against
// ojt_students by email (falling back to registration number). A row with
// neither field, or one that matches no student, comes back in `unmatched`
// rather than being silently dropped or turned into a phantom row.
export interface EligibilityBulkMarkRow {
  msuEmail?: string;
  msuRegistrationNumber?: string;
}

/** Which flag an upload sets. Both refuse the student at sign-in, with different messages. */
export type EligibilityBulkFlag = 'feePending' | 'isIntern';

export interface EligibilityBulkMarkResult {
  matched: number;
  created: number;
  updated: number;
  unmatched: Array<{ identifier: string; reason: string }>;
}

// Only ever sets the flag to true. Clearing one is a per-student correction on
// the row itself — a file of names should not silently un-flag everyone it
// happens not to mention.
export async function apiBulkMarkEligibility(
  flag: EligibilityBulkFlag,
  rows: EligibilityBulkMarkRow[]
): Promise<EligibilityBulkMarkResult> {
  const { data } = await apiFetch<{ data: EligibilityBulkMarkResult }>('/api/v1/eligibility/bulk-mark', {
    method: 'POST',
    body: JSON.stringify({ flag, rows }),
  });
  return data;
}
