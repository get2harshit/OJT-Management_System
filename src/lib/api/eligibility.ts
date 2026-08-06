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
export interface EligibilityBulkFeePendingRow {
  msuEmail?: string;
  msuRegistrationNumber?: string;
}

export interface EligibilityBulkFeePendingResult {
  matched: number;
  created: number;
  updated: number;
  unmatched: Array<{ identifier: string; reason: string }>;
}

export async function apiBulkMarkFeePending(
  rows: EligibilityBulkFeePendingRow[]
): Promise<EligibilityBulkFeePendingResult> {
  const { data } = await apiFetch<{ data: EligibilityBulkFeePendingResult }>('/api/v1/eligibility/bulk-fee-pending', {
    method: 'POST',
    body: JSON.stringify({ rows }),
  });
  return data;
}
