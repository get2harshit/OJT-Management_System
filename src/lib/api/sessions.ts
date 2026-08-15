// Session + attendance API client. Backend returns raw Prisma rows here
// (snake_case) rather than a camelCase-mapped DTO — same convention as
// tasks.ts's ApiAssignment/ApiTaskComment, since this module is deliberately
// modeled on TaskRepository's own raw-passthrough style. Types are named
// `Api...` and colocated here (not in src/lib/types) for the same reason
// tasks.ts keeps its own types local.
import { apiFetch, invalidateCached } from './client';

export type ApiSessionType = 'individual' | 'combined' | 'on_demand';
export type ApiSessionStatus = 'scheduled' | 'rescheduled' | 'completed' | 'cancelled';
export type ApiAttendanceStatus = 'not_marked' | 'present' | 'absent' | 'excused';

export interface ApiSessionMentorRef {
  id: string;
  full_name: string;
  email: string;
  is_external: boolean;
}

export interface ApiSessionTeamRef {
  id: string;
  session_id: string;
  team_id: string;
  team: { id: string; name: string };
}

export interface ApiSessionCoMentor {
  id: string;
  session_id: string;
  mentor_id: string;
  mentor_hourly_rate_snapshot: string | null;
  mentor_rate_currency_snapshot: string | null;
  mentor: { id: string; full_name: string; email: string };
}

export interface ApiSession {
  id: string;
  cohort_id: string;
  track_id: string | null;
  session_type: ApiSessionType;
  title: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  actual_duration_minutes: number | null;
  location_or_link: string | null;
  status: ApiSessionStatus;
  cancellation_reason: string | null;
  mentor_id: string;
  created_by_id: string;
  self_scheduled: boolean;
  source_request_id: string | null;
  mentor_hourly_rate_snapshot: string | null;
  mentor_rate_currency_snapshot: string | null;
  created_at: string;
  updated_at: string;
  mentor: ApiSessionMentorRef;
  creator: { id: string; full_name: string; email: string };
  track: { id: string; name: string; slug: string } | null;
  teams: ApiSessionTeamRef[];
  coMentors: ApiSessionCoMentor[];
}

export interface SessionsPage {
  data: ApiSession[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface SessionListFilter {
  cohortId?: string;
  mentorId?: string;
  teamId?: string;
  studentId?: string;
  status?: ApiSessionStatus;
  from?: string; // YYYY-MM-DD
  to?: string;
  page?: number;
  limit?: number;
}

function toQuery(filter: SessionListFilter): string {
  const query = new URLSearchParams();
  if (filter.cohortId) query.set('cohortId', filter.cohortId);
  if (filter.mentorId) query.set('mentorId', filter.mentorId);
  if (filter.teamId) query.set('teamId', filter.teamId);
  if (filter.studentId) query.set('studentId', filter.studentId);
  if (filter.status) query.set('status', filter.status);
  if (filter.from) query.set('from', filter.from);
  if (filter.to) query.set('to', filter.to);
  query.set('page', String(filter.page ?? 1));
  query.set('limit', String(filter.limit ?? 100));
  return query.toString();
}

// Envelope unwrap + pages->totalPages remap in one place, since every
// session/attendance list endpoint shares this exact backend shape.
async function fetchSessionsPage(path: string): Promise<SessionsPage> {
  const body = await apiFetch<{ data: ApiSession[]; pagination: { page: number; limit: number; total: number; pages: number } }>(path);
  return { data: body.data, pagination: { ...body.pagination, totalPages: body.pagination.pages } };
}

export interface CreateSessionBody {
  cohortId: string;
  trackId?: string;
  sessionType?: ApiSessionType;
  title?: string;
  scheduledDate: string; // YYYY-MM-DD
  startTime: string; // ISO datetime
  endTime: string; // ISO datetime
  locationOrLink?: string;
  mentorId: string;
  teamIds: string[];
}

export async function apiCreateSession(body: CreateSessionBody): Promise<ApiSession> {
  const res = await apiFetch<{ data: ApiSession }>('/api/v1/sessions', { method: 'POST', body: JSON.stringify(body) });
  invalidateCached('sessions');
  return res.data;
}

// Admin-scoped, arbitrary filters.
export async function apiListSessions(filter: SessionListFilter): Promise<SessionsPage> {
  return fetchSessionsPage(`/api/v1/sessions?${toQuery(filter)}`);
}

export async function apiGetMySessions(filter: SessionListFilter): Promise<SessionsPage> {
  return fetchSessionsPage(`/api/v1/mentors/me/sessions?${toQuery(filter)}`);
}

export async function apiGetMyUpcomingSessions(filter: SessionListFilter): Promise<SessionsPage> {
  return fetchSessionsPage(`/api/v1/students/me/sessions?${toQuery(filter)}`);
}

export interface RescheduleSessionBody {
  scheduledDate: string;
  startTime: string;
  endTime: string;
  locationOrLink?: string;
  title?: string;
  reason?: string;
}

export async function apiRescheduleSession(id: string, body: RescheduleSessionBody): Promise<ApiSession> {
  const res = await apiFetch<{ data: ApiSession }>(`/api/v1/sessions/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  invalidateCached('sessions');
  return res.data;
}

export async function apiCancelSession(id: string, reason: string): Promise<ApiSession> {
  const res = await apiFetch<{ data: ApiSession }>(`/api/v1/sessions/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
  invalidateCached('sessions');
  return res.data;
}

export async function apiCompleteSession(id: string, actualDurationMinutes?: number): Promise<ApiSession> {
  const res = await apiFetch<{ data: ApiSession }>(`/api/v1/sessions/${id}/complete`, {
    method: 'POST',
    body: JSON.stringify(actualDurationMinutes !== undefined ? { actualDurationMinutes } : {}),
  });
  invalidateCached('sessions');
  return res.data;
}

// ── Attendance ────────────────────────────────────────────────────────────

export interface ApiSessionAttendance {
  id: string;
  session_id: string;
  student_id: string;
  status: ApiAttendanceStatus;
  hours_credited: string | null;
  marked_by_id: string | null;
  marked_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  student: { id: string; full_name: string; email: string };
}

export interface ApiSessionAttendanceHistory {
  id: string;
  attendance_id: string;
  session_id: string;
  student_id: string;
  from_status: ApiAttendanceStatus;
  to_status: ApiAttendanceStatus;
  version_number: number;
  changed_by_id: string;
  changed_at: string;
  session_scheduled_date_snapshot: string;
  session_start_time_snapshot: string;
  session_end_time_snapshot: string;
  session_status_snapshot: ApiSessionStatus;
  hours_credited_snapshot: string | null;
  note: string | null;
}

export async function apiGetSessionAttendance(sessionId: string): Promise<ApiSessionAttendance[]> {
  const res = await apiFetch<{ data: ApiSessionAttendance[] }>(`/api/v1/sessions/${sessionId}/attendance`);
  return res.data;
}

export interface MarkAttendanceBody {
  status: ApiAttendanceStatus;
  hoursCredited?: number;
  notes?: string;
}

export async function apiMarkAttendance(sessionId: string, studentId: string, body: MarkAttendanceBody): Promise<ApiSessionAttendance> {
  const res = await apiFetch<{ data: ApiSessionAttendance }>(`/api/v1/sessions/${sessionId}/attendance/${studentId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  invalidateCached('attendance');
  return res.data;
}

export async function apiBulkMarkAttendance(
  sessionId: string,
  entries: Array<{ studentId: string } & MarkAttendanceBody>
): Promise<ApiSessionAttendance[]> {
  const res = await apiFetch<{ data: ApiSessionAttendance[] }>(`/api/v1/sessions/${sessionId}/attendance/bulk`, {
    method: 'POST',
    body: JSON.stringify({ entries }),
  });
  invalidateCached('attendance');
  return res.data;
}

export async function apiGetAttendanceHistory(sessionId: string, studentId: string): Promise<ApiSessionAttendanceHistory[]> {
  const res = await apiFetch<{ data: ApiSessionAttendanceHistory[] }>(`/api/v1/sessions/${sessionId}/attendance/${studentId}/history`);
  return res.data;
}

export type ApiMyAttendanceRow = ApiSessionAttendance & {
  session: Pick<ApiSession, 'id' | 'scheduled_date' | 'start_time' | 'end_time' | 'status'> & {
    mentor: { id: string; full_name: string };
  };
};

export interface MyAttendancePage {
  data: ApiMyAttendanceRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export async function apiGetMyAttendance(params: { cohortId?: string; status?: ApiAttendanceStatus; page?: number; limit?: number }): Promise<MyAttendancePage> {
  const query = new URLSearchParams();
  if (params.cohortId) query.set('cohortId', params.cohortId);
  if (params.status) query.set('status', params.status);
  query.set('page', String(params.page ?? 1));
  query.set('limit', String(params.limit ?? 100));
  const body = await apiFetch<{ data: ApiMyAttendanceRow[]; pagination: { page: number; limit: number; total: number; pages: number } }>(
    `/api/v1/students/me/attendance?${query.toString()}`
  );
  return { data: body.data, pagination: { ...body.pagination, totalPages: body.pagination.pages } };
}
