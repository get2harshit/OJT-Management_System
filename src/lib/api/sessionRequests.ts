// Combined/on-demand session request + approval workflow. Same
// raw-passthrough convention as sessions.ts.
import { apiFetch, invalidateCached } from './client';
import type { ApiSession } from './sessions';

export type ApiSessionRequestType = 'combined' | 'on_demand';
export type ApiSessionRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ApiSessionRequest {
  id: string;
  cohort_id: string;
  requested_by_id: string;
  request_type: ApiSessionRequestType;
  status: ApiSessionRequestStatus;
  proposed_date: string;
  proposed_start_time: string;
  proposed_end_time: string;
  reason: string;
  requested_team_ids: string[];
  requested_co_mentor_ids: string[];
  decided_by_id: string | null;
  decided_at: string | null;
  decision_note: string | null;
  resulting_session_id: string | null;
  created_at: string;
  updated_at: string;
  requester: { id: string; full_name: string; email: string };
  decider: { id: string; full_name: string } | null;
  resultingSession: ApiSession | null;
}

export interface SessionRequestListFilter {
  cohortId?: string;
  status?: ApiSessionRequestStatus;
  requestType?: ApiSessionRequestType;
  page?: number;
  limit?: number;
}

export interface SessionRequestsPage {
  data: ApiSessionRequest[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

function toQuery(filter: SessionRequestListFilter): string {
  const query = new URLSearchParams();
  if (filter.cohortId) query.set('cohortId', filter.cohortId);
  if (filter.status) query.set('status', filter.status);
  if (filter.requestType) query.set('requestType', filter.requestType);
  query.set('page', String(filter.page ?? 1));
  query.set('limit', String(filter.limit ?? 20));
  return query.toString();
}

async function fetchRequestsPage(path: string): Promise<SessionRequestsPage> {
  const body = await apiFetch<{ data: ApiSessionRequest[]; pagination: { page: number; limit: number; total: number; pages: number } }>(path);
  return { data: body.data, pagination: { ...body.pagination, totalPages: body.pagination.pages } };
}

export interface CreateSessionRequestBody {
  cohortId: string;
  requestType: ApiSessionRequestType;
  proposedDate: string; // YYYY-MM-DD
  proposedStartTime: string; // ISO datetime
  proposedEndTime: string;
  reason: string;
  teamIds: string[];
  coMentorIds?: string[];
}

export async function apiCreateSessionRequest(body: CreateSessionRequestBody): Promise<ApiSessionRequest> {
  const res = await apiFetch<{ data: ApiSessionRequest }>('/api/v1/session-requests', { method: 'POST', body: JSON.stringify(body) });
  invalidateCached('session-requests');
  return res.data;
}

// Admin-scoped approval queue.
export async function apiListSessionRequests(filter: SessionRequestListFilter): Promise<SessionRequestsPage> {
  return fetchRequestsPage(`/api/v1/session-requests?${toQuery(filter)}`);
}

export async function apiGetMySessionRequests(filter: SessionRequestListFilter): Promise<SessionRequestsPage> {
  return fetchRequestsPage(`/api/v1/mentors/me/session-requests?${toQuery(filter)}`);
}

export async function apiApproveSessionRequest(id: string, decisionNote?: string): Promise<ApiSessionRequest> {
  const res = await apiFetch<{ data: ApiSessionRequest }>(`/api/v1/session-requests/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ decisionNote }),
  });
  invalidateCached('session-requests');
  invalidateCached('sessions');
  return res.data;
}

export async function apiRejectSessionRequest(id: string, decisionNote: string): Promise<ApiSessionRequest> {
  const res = await apiFetch<{ data: ApiSessionRequest }>(`/api/v1/session-requests/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ decisionNote }),
  });
  invalidateCached('session-requests');
  return res.data;
}

export async function apiCancelSessionRequest(id: string): Promise<ApiSessionRequest> {
  const res = await apiFetch<{ data: ApiSessionRequest }>(`/api/v1/session-requests/${id}/cancel`, { method: 'POST' });
  invalidateCached('session-requests');
  return res.data;
}
