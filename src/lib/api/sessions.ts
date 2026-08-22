// Session + attendance API client. Backend returns raw Prisma rows here
// (snake_case) rather than a camelCase-mapped DTO — same convention as
// tasks.ts's ApiAssignment/ApiTaskComment, since this module is deliberately
// modeled on TaskRepository's own raw-passthrough style. Types are named
// `Api...` and colocated here (not in src/lib/types) for the same reason
// tasks.ts keeps its own types local.
import { apiFetch, invalidateCached } from './client';

// How the session came about: booked directly, or approved from a combined /
// on-demand request. Provenance, not audience — what kind of sitting it is
// (1:1 / Group / Common) is ApiSessionKind below, derived from its teams.
export type ApiSessionType = 'individual' | 'combined' | 'on_demand';

// What kind of sitting it is, derived server-side from the teams on it and
// which of the mentor's groups they belong to. One team is a 1:1; two or more
// spanning two or more of the mentor's groups is a Common session — the case
// where a group whose slot was missed gets merged into another group's.
export type ApiSessionKind = 'one_on_one' | 'group' | 'common';
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
  team: { id: string; name: string; group_id: string | null; group: { id: string; name: string } | null };
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
  // Computed by the backend and sent with the session, so the rule deciding
  // what a session is called lives in one place rather than in every screen
  // that shows one.
  kind: ApiSessionKind;
  kind_label: string;
  title: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  actual_duration_minutes: number | null;
  location_or_link: string | null;
  /**
   * The multimedia service's own numeric id for this session, set once it has
   * been started there. Null means it has not been started — either because it
   * has not happened yet, or because this session is run somewhere else
   * entirely and location_or_link is a pasted Meet link or a room name.
   *
   * The two ways of running a session coexist deliberately: hosting one here
   * is what Start does, and nothing forces an existing pasted link to move.
   */
  live_session_id: number | null;
  live_started_at: string | null;
  live_ended_at: string | null;
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

/**
 * The calling mentor's session record in aggregate. Carries no rate or
 * amount by design — it describes work delivered, not money.
 */
export interface ApiMentorSessionStats {
  scheduled: number;
  rescheduled: number;
  completed: number;
  cancelled: number;
  total: number;
  /** Actual duration where the mentor recorded one, else the scheduled duration. */
  deliveredMinutes: number;
  /** Distinct teams this mentor has actually completed a session with. */
  teamsMentored: number;
}

export async function apiGetMySessionStats(cohortId?: string): Promise<ApiMentorSessionStats> {
  const query = cohortId ? `?cohortId=${encodeURIComponent(cohortId)}` : '';
  const res = await apiFetch<{ data: ApiMentorSessionStats }>(`/api/v1/mentors/me/session-stats${query}`);
  return res.data;
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


// ── Running a session on the multimedia service ──────────────────────────────
//
// Starting, ending and joining are handled by the multimedia service under
// /mm/v3/liveclass/* — their path and their word, not renamed to ours, since
// it is their contract. Nothing here calls it: all three go to our own backend,
// which holds the credential and works out who is asking from their JWT.
//
// That is a security boundary rather than tidiness. The multimedia contract
// takes facultyId and studentId in the request body, so a page calling it
// directly could ask for a join token as somebody else, for a session they are
// not in. Our server ignores any identity the client offers and uses the
// caller's own — which is why none of these send an id of their own.

/**
 * Starts this session's room and returns a token to walk straight into it.
 *
 * The host gets their token from this call rather than having to ask for one
 * separately — starting a session and not being in it is not a thing anyone
 * wants, and the room exists from this moment.
 */
export interface LiveStartResult {
  session: ApiSession;
  authToken: string;
}

export async function apiStartLiveSession(sessionId: string): Promise<LiveStartResult> {
  const res = await apiFetch<{ data: LiveStartResult }>(`/api/v1/sessions/${sessionId}/live/start`, { method: 'POST' });
  invalidateCached('sessions');
  return res.data;
}

export async function apiEndLiveSession(sessionId: string): Promise<ApiSession> {
  const res = await apiFetch<{ data: ApiSession }>(`/api/v1/sessions/${sessionId}/live/end`, { method: 'POST' });
  invalidateCached('sessions');
  return res.data;
}

/**
 * A token for this person to join this session's room with.
 *
 * There is no "viewer" and "interactive" call. What someone may do in the room
 * — speak, share a screen, end it for everyone — is carried by the role baked
 * into the token, and the server decides that role from who is asking. Asking
 * for extra permissions from the client is not a thing the protocol offers,
 * which is the right answer anyway.
 *
 * Short-lived, so it is fetched at the moment of joining and never cached.
 */
export interface SessionJoinToken {
  authToken: string;
  role: 'mentor' | 'student';
}

export async function apiGetSessionJoinToken(sessionId: string): Promise<SessionJoinToken> {
  const res = await apiFetch<{ data: SessionJoinToken }>(`/api/v1/sessions/${sessionId}/live/join-token`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return res.data;
}

// ── What actually happened in the room — pulled from Polaris's own join/leave
// logs, not our own database. Read-only; the attendance sync below is the
// only thing here that writes anything.

export interface ApiLiveStudentReport {
  studentId: string;
  fullName: string;
  email: string;
  joined: boolean;
  joinedAt: string | null;
  leftAt: string | null;
  durationSeconds: number;
  percentPresent: number;
  meetsAttendanceThreshold: boolean;
}

export interface ApiLiveOtherParticipant {
  userId: string;
  name: string;
  roles: string[];
  joinedAt: string | null;
  leftAt: string | null;
  durationSeconds: number;
}

export interface ApiLiveSessionReport {
  sessionId: string;
  totalDurationSeconds: number;
  sessionStart: string | null;
  sessionEnd: string | null;
  attendanceThresholdPercent: number;
  totalExpected: number;
  presentCount: number;
  students: ApiLiveStudentReport[];
  otherParticipants: ApiLiveOtherParticipant[];
}

export async function apiGetLiveSessionReport(sessionId: string): Promise<ApiLiveSessionReport> {
  const res = await apiFetch<{ data: ApiLiveSessionReport }>(`/api/v1/sessions/${sessionId}/live-report`);
  return res.data;
}

/**
 * Fills in real attendance from the report above, for students still
 * 'not_marked' only — never overwrites a mentor's own mark. Safe to call more
 * than once; called automatically whenever the report is opened.
 */
export async function apiSyncLiveAttendance(sessionId: string): Promise<{ updatedCount: number }> {
  const res = await apiFetch<{ data: { updatedCount: number } }>(`/api/v1/sessions/${sessionId}/live-report/sync-attendance`, {
    method: 'POST',
  });
  invalidateCached('sessions');
  return res.data;
}
