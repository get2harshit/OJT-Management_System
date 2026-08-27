// Student -> mentor doubt-resolution requests.
//
// A different thing from sessionRequests.ts despite the similar name: that one
// is a mentor asking an admin to approve a combined/on-demand session, this one
// is a student asking their own mentor for time to clear a doubt. Same
// raw-passthrough (snake_case) convention as sessions.ts, since the backend
// returns Prisma rows here rather than a mapped DTO.
import { apiFetch, invalidateCached } from './client';

export type ApiDoubtRequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface ApiDoubtRequest {
  id: string;
  cohort_id: string;
  raised_by_id: string;
  team_id: string | null;
  mentor_id: string;
  topic: string;
  description: string | null;
  related_task_id: string | null;
  /** Free text the student typed, e.g. "mornings suit me" — never a booking. */
  preferred_window: string | null;
  status: ApiDoubtRequestStatus;
  decided_at: string | null;
  decision_note: string | null;
  resulting_session_id: string | null;
  created_at: string;
  raisedBy: { id: string; full_name: string; email: string };
  mentor: { id: string; full_name: string; email: string };
  team: { id: string; name: string } | null;
  relatedTask: { id: string; title: string } | null;
  resultingSession: {
    id: string;
    scheduled_date: string;
    start_time: string;
    end_time: string;
    location_or_link: string | null;
    status: string;
  } | null;
}

export interface DoubtRequestsPage {
  data: ApiDoubtRequest[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface RaiseDoubtRequestBody {
  topic: string;
  description?: string;
  /** Raise it for the whole team rather than just yourself. */
  forTeam?: boolean;
  relatedTaskId?: string;
  preferredWindow?: string;
}

export interface AcceptDoubtRequestBody {
  scheduledDate: string;
  startTime: string;
  endTime: string;
  locationOrLink?: string;
  title?: string;
  decisionNote?: string;
}

interface DoubtRequestFilter {
  status?: ApiDoubtRequestStatus;
  cohortId?: string;
  page?: number;
  limit?: number;
}

function toQuery(filter: DoubtRequestFilter): string {
  const query = new URLSearchParams();
  if (filter.status) query.set('status', filter.status);
  if (filter.cohortId) query.set('cohortId', filter.cohortId);
  if (filter.page) query.set('page', String(filter.page));
  if (filter.limit) query.set('limit', String(filter.limit));
  return query.toString();
}

async function fetchPage(url: string): Promise<DoubtRequestsPage> {
  const res = await apiFetch<{
    data: ApiDoubtRequest[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }>(url);
  return {
    data: res.data,
    pagination: {
      page: res.pagination.page,
      limit: res.pagination.limit,
      total: res.pagination.total,
      totalPages: res.pagination.pages,
    },
  };
}

export async function apiRaiseDoubtRequest(body: RaiseDoubtRequestBody): Promise<ApiDoubtRequest> {
  const res = await apiFetch<{ data: ApiDoubtRequest }>('/api/v1/doubt-requests', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  invalidateCached('doubt-requests');
  return res.data;
}

export async function apiGetMyDoubtRequests(filter: DoubtRequestFilter = {}): Promise<DoubtRequestsPage> {
  return fetchPage(`/api/v1/students/me/doubt-requests?${toQuery(filter)}`);
}

export async function apiGetDoubtRequestInbox(filter: DoubtRequestFilter = {}): Promise<DoubtRequestsPage> {
  return fetchPage(`/api/v1/mentors/me/doubt-requests?${toQuery(filter)}`);
}

/** Schedules the session and accepts in one call — the slot is the mentor's choice. */
export async function apiAcceptDoubtRequest(id: string, body: AcceptDoubtRequestBody): Promise<ApiDoubtRequest> {
  const res = await apiFetch<{ data: ApiDoubtRequest }>(`/api/v1/doubt-requests/${id}/accept`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  invalidateCached('doubt-requests');
  invalidateCached('sessions');
  return res.data;
}

export async function apiDeclineDoubtRequest(id: string, decisionNote: string): Promise<ApiDoubtRequest> {
  const res = await apiFetch<{ data: ApiDoubtRequest }>(`/api/v1/doubt-requests/${id}/decline`, {
    method: 'POST',
    body: JSON.stringify({ decisionNote }),
  });
  invalidateCached('doubt-requests');
  return res.data;
}

export async function apiCancelDoubtRequest(id: string): Promise<ApiDoubtRequest> {
  const res = await apiFetch<{ data: ApiDoubtRequest }>(`/api/v1/doubt-requests/${id}/cancel`, { method: 'POST' });
  invalidateCached('doubt-requests');
  return res.data;
}
