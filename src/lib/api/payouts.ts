// Mentor payout + payout-batch API client. Same raw-passthrough convention
// as sessions.ts/schedulingConfig.ts — this backend module is raw-Prisma
// passthrough, not camelCase-mapped.
import { apiFetch, invalidateCached, API_BASE, getStoredToken } from './client';

export type ApiPayoutStatus = 'pending' | 'approved' | 'paid' | 'void';

export interface ApiPayoutMentorRef {
  id: string;
  full_name: string;
  email: string;
  is_external: boolean;
}

export interface ApiPayoutSessionRef {
  id: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  actual_duration_minutes: number | null;
  cohort_id: string;
}

export interface ApiSessionPayout {
  id: string;
  session_id: string;
  mentor_id: string;
  hourly_rate_snapshot: string;
  currency_snapshot: 'INR' | 'USD';
  payable_hours: string;
  gross_amount: string;
  status: ApiPayoutStatus;
  computed_at: string;
  approved_by_id: string | null;
  approved_at: string | null;
  paid_at: string | null;
  batch_id: string | null;
  notes: string | null;
  mentor: ApiPayoutMentorRef;
  session: ApiPayoutSessionRef;
  approver: { id: string; full_name: string } | null;
}

export interface PayoutListFilter {
  mentorId?: string;
  status?: ApiPayoutStatus;
  cohortId?: string;
  batchId?: string;
  mentorType?: 'internal' | 'external';
  from?: string; // YYYY-MM-DD
  to?: string;
  page?: number;
  limit?: number;
}

export interface PayoutsPage {
  data: ApiSessionPayout[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

function toPayoutQuery(filter: PayoutListFilter): string {
  const query = new URLSearchParams();
  if (filter.mentorId) query.set('mentorId', filter.mentorId);
  if (filter.status) query.set('status', filter.status);
  if (filter.cohortId) query.set('cohortId', filter.cohortId);
  if (filter.batchId) query.set('batchId', filter.batchId);
  if (filter.mentorType) query.set('mentorType', filter.mentorType);
  if (filter.from) query.set('from', filter.from);
  if (filter.to) query.set('to', filter.to);
  query.set('page', String(filter.page ?? 1));
  query.set('limit', String(filter.limit ?? 20));
  return query.toString();
}

async function fetchPayoutsPage(path: string): Promise<PayoutsPage> {
  const body = await apiFetch<{ data: ApiSessionPayout[]; pagination: { page: number; limit: number; total: number; pages: number } }>(path);
  return { data: body.data, pagination: { ...body.pagination, totalPages: body.pagination.pages } };
}

export async function apiListPayouts(filter: PayoutListFilter): Promise<PayoutsPage> {
  return fetchPayoutsPage(`/api/v1/payouts?${toPayoutQuery(filter)}`);
}

export async function apiGetMyPayouts(filter: PayoutListFilter): Promise<PayoutsPage> {
  return fetchPayoutsPage(`/api/v1/mentors/me/payouts?${toPayoutQuery(filter)}`);
}

export async function apiGetMentorPayouts(mentorId: string, filter: PayoutListFilter): Promise<PayoutsPage> {
  return fetchPayoutsPage(`/api/v1/mentors/${mentorId}/payouts?${toPayoutQuery(filter)}`);
}

export async function apiApprovePayout(id: string): Promise<ApiSessionPayout> {
  const res = await apiFetch<{ data: ApiSessionPayout }>(`/api/v1/payouts/${id}/approve`, { method: 'PATCH' });
  invalidateCached('payouts');
  return res.data;
}

export async function apiMarkPayoutPaid(id: string): Promise<ApiSessionPayout> {
  const res = await apiFetch<{ data: ApiSessionPayout }>(`/api/v1/payouts/${id}/mark-paid`, { method: 'PATCH' });
  invalidateCached('payouts');
  return res.data;
}

// ── Batches ──────────────────────────────────────────────────────────────

export interface ApiPayoutBatchSummary {
  id: string;
  cohort_id: string | null;
  generated_by_id: string;
  period_start: string;
  period_end: string;
  mentor_type_filter: string | null;
  status: string;
  total_amount: string;
  generated_at: string;
  finalized_at: string | null;
}

export interface ApiPayoutBatchEntry {
  id: string;
  session_id: string;
  mentor_id: string;
  hourly_rate_snapshot: string;
  currency_snapshot: 'INR' | 'USD';
  payable_hours: string;
  gross_amount: string;
  status: ApiPayoutStatus;
  mentor: { id: string; full_name: string; email: string; is_external: boolean };
  session: { id: string; scheduled_date: string; start_time: string; end_time: string };
}

export interface ApiPayoutBatch extends ApiPayoutBatchSummary {
  entries: ApiPayoutBatchEntry[];
}

export interface GenerateBatchBody {
  cohortId?: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;
  mentorTypeFilter?: 'internal' | 'external';
}

export async function apiGenerateBatch(body: GenerateBatchBody): Promise<ApiPayoutBatch> {
  const res = await apiFetch<{ data: ApiPayoutBatch }>('/api/v1/payout-batches', { method: 'POST', body: JSON.stringify(body) });
  invalidateCached('payouts');
  invalidateCached('payout-batches');
  return res.data;
}

export interface BatchListFilter {
  cohortId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export async function apiListBatches(filter: BatchListFilter): Promise<{ data: ApiPayoutBatchSummary[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const query = new URLSearchParams();
  if (filter.cohortId) query.set('cohortId', filter.cohortId);
  if (filter.status) query.set('status', filter.status);
  query.set('page', String(filter.page ?? 1));
  query.set('limit', String(filter.limit ?? 20));
  const body = await apiFetch<{ data: ApiPayoutBatchSummary[]; pagination: { page: number; limit: number; total: number; pages: number } }>(
    `/api/v1/payout-batches?${query.toString()}`
  );
  return { data: body.data, pagination: { ...body.pagination, totalPages: body.pagination.pages } };
}

export async function apiGetBatchById(id: string): Promise<ApiPayoutBatch> {
  const res = await apiFetch<{ data: ApiPayoutBatch }>(`/api/v1/payout-batches/${id}`);
  return res.data;
}

// The export endpoint returns a raw CSV body, not the { success, data }
// envelope every other endpoint uses — apiFetch's res.json() would fail
// parsing it, so this hits fetch directly and drives a browser download the
// same way DataTable's own CSV export does (blob -> object URL -> click).
export async function apiDownloadBatchExport(id: string): Promise<void> {
  const token = getStoredToken();
  const res = await fetch(`${API_BASE}/api/v1/payout-batches/${id}/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error(`Failed to export batch (${res.status})`);
  }
  const csv = await res.text();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `payout-batch-${id}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
