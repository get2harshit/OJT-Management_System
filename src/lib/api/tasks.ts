import { apiFetch, cachedFetch, invalidateCached } from './client';

const TASKS_TTL = 15_000;

export type ApiAssignmentStatus = 'pending' | 'review' | 'resubmit' | 'approved';

export interface ApiTaskComment {
  id: string;
  comment_text: string;
  status_to: string;
  is_mandatory: boolean;
  created_at: string;
  commented_by?: {
    id: string;
    full_name: string;
    role: string;
  };
}

export interface ApiTaskStatusHistory {
  id: string;
  from_status: ApiAssignmentStatus;
  to_status: ApiAssignmentStatus;
  version_number: number;
  changed_by_id: string;
  changed_at: string;
  document_submission_id?: string | null;
  comments?: ApiTaskComment[];
}

export interface ApiAssignment {
  id: string;
  task_id: string;
  assignee_id: string;
  team_id?: string | null;
  // The team's display name (e.g. "G1") — only present via GET /tasks/:id
  // (apiGetTask), same as team_id already was; null for an individual
  // assignment or one predating this field.
  team_name?: string | null;
  status: ApiAssignmentStatus;
  resubmit_count: number;
  max_resubmit_count: number;
  assigned_at: string;
  updated_at: string;
  assignee?: {
    id: string;
    full_name: string;
    role: string;
  };
  statusHistory?: ApiTaskStatusHistory[];
  comments?: ApiTaskComment[];
  structured_response?: ApiStructuredResponse | null;
}

export interface ApiChecklistItem {
  id: string;
  label: string;
}

export interface ApiQnaQuestion {
  id: string;
  question: string;
}

// The assignee's own saved answers for the parent task's checklist_items/
// qna_questions — keyed by item/question id. Absent/empty until the
// assignee has saved at least a draft.
export interface ApiStructuredResponse {
  checklist?: Record<string, boolean>;
  qna?: Record<string, string>;
}

// The caller's own assignment row on a task, if they have one — resolved
// server-side (it already knows who's asking) instead of making every page
// search a full assignments array for "which one is mine".
export interface ApiOwnAssignment {
  id: string;
  status: ApiAssignmentStatus;
  resubmit_count: number;
  max_resubmit_count: number;
  structured_response?: ApiStructuredResponse | null;
}

export interface ApiAssignmentPreview {
  assigneeId: string;
  fullName: string | null;
  role: string | null;
  status: ApiAssignmentStatus;
  // Present whenever the assignment belongs to a team, regardless of the
  // preview cap below — lets a team-assigned task's preview be grouped by
  // team the same way the full apiGetTask assignments array already is.
  teamId?: string | null;
  teamName?: string | null;
}

// Per-task assignment aggregate for list views — a batch/track-wide task
// can fan out to 100+ assignments, so by default GET /tasks never ships the
// full list; `preview` is capped (currently 5), just enough for a "name,
// name, +N more" chip row. Passing include_full_assignments: true on the
// request (see ApiTaskListFilter) lifts the cap and returns everyone in
// `preview` instead — the admin CSV export's way of getting every assignee's
// name across every task in one page-sized round trip rather than one
// GET /tasks/:id (apiGetTask) per task. Leave the flag off and this stays
// the same capped shape it always was.
export interface ApiAssignmentsSummary {
  total: number;
  byStatus: Record<ApiAssignmentStatus, number>;
  preview: ApiAssignmentPreview[];
}

export interface ApiTask {
  id: string;
  title: string;
  description: string;
  week: string;
  // A task now carries a set of tracks — `tracks` is the real field.
  // `track` is transitional (first of `tracks`, or null) — kept only so a
  // not-yet-redeployed page reading the old single-value shape doesn't
  // break during the gap between a backend and frontend deploy.
  tracks: string[];
  track?: string | null;
  start_date?: string | null;
  deadline: string;
  target_role: 'student' | 'mentor' | 'batch_manager';
  task_type?: ApiTaskType | null;
  category: ApiTaskCategory;
  assign_mode?: ApiTaskAssignMode | null;
  assigned_by_id: string;
  // Every task belongs to exactly one cohort (backend requirement) — used
  // to jump the Submissions tab to the right cohort when "View Submission"
  // redirects there from a different cohort than the one currently selected.
  cohort_id: string;
  created_at: string;
  updated_at: string;
  assigner?: {
    id: string;
    full_name: string;
    role: string;
  };
  // Only present on GET /tasks/:id (apiGetTask) — the full per-assignee
  // list for the review panels. List responses (apiListTasks) carry
  // myAssignment + assignmentsSummary instead.
  assignments?: ApiAssignment[];
  myAssignment?: ApiOwnAssignment | null;
  assignmentsSummary?: ApiAssignmentsSummary;
  // Admin-only structured content for mentor-targeted tasks — null/absent
  // when this task has no checklist/Q&A. Excluded from the bulk list
  // (apiListTasks) the same way assignments is; only present via
  // GET /tasks/:id (apiGetTask).
  checklist_items?: ApiChecklistItem[] | null;
  qna_questions?: ApiQnaQuestion[] | null;
}

export type ApiTaskType = 'prd' | 'db_schema' | 'hld' | 'lld' | 'api_contract' | 'others';
// 'weekly_report' is mentor-only and admin-only (backend enforces both) —
// it makes the mentor's task page render the weekly report grid instead of
// a submit box. See ojt_mentor_weekly_reports.
export type ApiTaskCategory = 'document_submission' | 'general' | 'link_submission' | 'weekly_report';
export type ApiTaskAssignMode = 'team' | 'individual';

// Backend requires week/tracks/start_date/deadline/target_role/category/
// assign_mode unconditionally now (only `title` used to be required) — see
// createTaskSchema in task.routes.ts. task_type is no longer set at
// creation — the task's title already conveys what deliverable is expected,
// and category (document_submission/general/link_submission) is what
// actually drives submission behavior.
export interface CreateTaskPayload {
  title: string;
  description?: string;
  week: string; // e.g. "Week 1"
  tracks: string[]; // e.g. ["product_development", "gen_ai"] (slugs, mapped automatically)
  start_date: string; // ISO datetime string, must be before deadline
  deadline: string; // ISO datetime string
  target_role: 'student' | 'mentor' | 'batch_manager';
  category: ApiTaskCategory;
  assign_mode: ApiTaskAssignMode;
  batch?: string;
  teamIds?: string[];
  assignees?: string[];
  // Required by the backend — every task belongs to exactly one cohort.
  cohort_id: string;
  // checklist_items/qna_questions used to be settable here. A mentor task
  // is now created with category: 'weekly_report' instead, and the answers
  // live in their own tables rather than a JSON blob. The backend no longer
  // accepts either field on create.
}

// Backend's PUT /tasks/:id only persists these fields (see updateTaskSchema in
// task.routes.ts and TaskService.updateTask) — reassigning target_role/batch
// isn't supported on update; assignees are added/removed via the dedicated
// apiAddTaskAssignees/apiRemoveTaskAssignment endpoints instead.
export interface UpdateTaskPayload {
  title?: string;
  description?: string;
  week?: string;
  tracks?: string[];
  deadline?: string;
}

// Shared shape for a batch mutation that can partially fail — one bad id
// (not yet published, already assigned, wrong status, out of quota) is
// reported per-item instead of failing the whole request.
export interface ApiBatchSkip {
  assigneeId?: string;
  assignmentId?: string;
  reason: string;
}

export interface ApiTaskPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface ApiTaskListFilter {
  page?: number;
  limit?: number;
  task_type?: ApiTaskType;
  category?: ApiTaskCategory;
  status?: ApiAssignmentStatus;
  week?: string;
  batch?: string;
  track?: string;
  assignee?: string;
  // Scopes to tasks a specific person created — set only via a deep link
  // (e.g. the Mentor Workspace's "this mentor's tasks" link), not a picker
  // in this UI. Distinct from assignedByFilter's 'me'/'mentor' role split,
  // which only ever filters the currently-loaded page client-side.
  assigned_by_id?: string;
  search?: string;
  sort?: 'deadline' | 'created_at' | 'week' | 'status';
  // Admins have no ojt_cohort_members row of their own, so the backend
  // can't infer "their" cohort the way it does for students/mentors —
  // without this, an admin gets an empty list back.
  cohort_id?: string;
  // Lifts assignmentsSummary.preview's 5-name cap to everyone on the task —
  // see ApiAssignmentsSummary. Only the CSV export sets this.
  include_full_assignments?: boolean;
}

export async function apiCreateTask(payload: CreateTaskPayload): Promise<{ success: boolean; message: string; data: ApiTask }> {
  const res = await apiFetch<{ success: boolean; message: string; data: ApiTask }>('/api/v1/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  invalidateCached('tasks:list');
  return res;
}

// GET /tasks response is double-nested ({success, data: {data, pagination}})
// server-side — flattened here so `res.data` stays the plain task array for
// every existing caller, with `res.pagination` added alongside for callers
// that want to build pagination controls. Cached per distinct filter/
// pagination combo — every task page (admin/mentor/student) independently
// re-fetches this on every mount/tab-switch, usually with the same filters.
export async function apiListTasks(filter: ApiTaskListFilter = {}): Promise<{ success: boolean; data: ApiTask[]; pagination: ApiTaskPagination }> {
  const params = new URLSearchParams();
  Object.entries(filter).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });
  const qs = params.toString();
  return cachedFetch(`tasks:list:${qs}`, TASKS_TTL, async () => {
    const res = await apiFetch<{ success: boolean; data: { data: ApiTask[]; pagination: ApiTaskPagination } }>(
      `/api/v1/tasks${qs ? `?${qs}` : ''}`,
      { method: 'GET' }
    );
    return { success: res.success, data: res.data.data, pagination: res.data.pagination };
  });
}

export async function apiGetTask(id: string): Promise<{ success: boolean; data: ApiTask }> {
  return cachedFetch(`tasks:get:${id}`, TASKS_TTL, () =>
    apiFetch<{ success: boolean; data: ApiTask }>(`/api/v1/tasks/${id}`, { method: 'GET' })
  );
}

export async function apiUpdateTask(id: string, payload: UpdateTaskPayload): Promise<{ success: boolean; message: string; data: ApiTask }> {
  const res = await apiFetch<{ success: boolean; message: string; data: ApiTask }>(`/api/v1/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  invalidateCached('tasks:list');
  invalidateCached(`tasks:get:${id}`);
  return res;
}

// Additive only — never touches an existing assignment. See
// removeTaskAssignment/addTaskAssignments in TaskRepository.ts for why.
export async function apiAddTaskAssignees(
  taskId: string,
  assigneeIds: string[]
): Promise<{ success: boolean; message: string; data: { added: string[]; skipped: ApiBatchSkip[] } }> {
  const res = await apiFetch<{ success: boolean; message: string; data: { added: string[]; skipped: ApiBatchSkip[] } }>(
    `/api/v1/tasks/${taskId}/assignees`,
    { method: 'POST', body: JSON.stringify({ assigneeIds }) }
  );
  invalidateTaskCaches(taskId);
  return res;
}

// Soft-removes one assignee — their submission/status history is kept, they
// just stop seeing this task and drop out of active listings.
export async function apiRemoveTaskAssignment(taskId: string, assignmentId: string): Promise<{ success: boolean; message: string }> {
  const res = await apiFetch<{ success: boolean; message: string }>(
    `/api/v1/tasks/${taskId}/assignments/${assignmentId}`,
    { method: 'DELETE' }
  );
  invalidateTaskCaches(taskId);
  return res;
}

export async function apiDeleteTask(id: string): Promise<{ success: boolean; message: string }> {
  const res = await apiFetch<{ success: boolean; message: string }>(`/api/v1/tasks/${id}`, {
    method: 'DELETE',
  });
  invalidateCached('tasks:list');
  invalidateCached(`tasks:get:${id}`);
  return res;
}

export interface ApiWorkflowResponse {
  success: boolean;
  message: string;
  data: ApiAssignment;
}

function invalidateTaskCaches(taskId: string): void {
  invalidateCached('tasks:list');
  invalidateCached(`tasks:get:${taskId}`);
}

// Only meaningful for non-document tasks (category !== 'document_submission')
// — a document-linked task's pending/resubmit -> review transition already
// happens automatically server-side the moment the student uploads a
// document via apiUploadPrd (see SubmissionService.syncAssignmentStatus).
export async function apiSubmitTask(taskId: string, assignmentId: string, documentSubmissionId?: string): Promise<ApiWorkflowResponse> {
  const res = await apiFetch<ApiWorkflowResponse>(`/api/v1/tasks/${taskId}/assignments/${assignmentId}/submit`, {
    method: 'POST',
    body: JSON.stringify(documentSubmissionId ? { documentSubmissionId } : {}),
  });
  invalidateTaskCaches(taskId);
  return res;
}

export async function apiResubmitTask(taskId: string, assignmentId: string, documentSubmissionId?: string): Promise<ApiWorkflowResponse> {
  const res = await apiFetch<ApiWorkflowResponse>(`/api/v1/tasks/${taskId}/assignments/${assignmentId}/resubmit`, {
    method: 'POST',
    body: JSON.stringify(documentSubmissionId ? { documentSubmissionId } : {}),
  });
  invalidateTaskCaches(taskId);
  return res;
}

// Draft-saves the assignee's checklist/Q&A answers — callable repeatedly
// before submit (autosave), not a one-shot action. Deliberately doesn't
// invalidate the task caches on every call — completeness is only checked
// server-side at submit time, and autosave-triggered cache thrash on every
// keystroke/checkbox click would be wasteful.
export async function apiSaveStructuredResponse(
  taskId: string,
  assignmentId: string,
  response: ApiStructuredResponse
): Promise<ApiWorkflowResponse> {
  return apiFetch<ApiWorkflowResponse>(`/api/v1/tasks/${taskId}/assignments/${assignmentId}/structured-response`, {
    method: 'PATCH',
    body: JSON.stringify({ response }),
  });
}

export async function apiApproveTask(taskId: string, assignmentId: string, comment?: string): Promise<ApiWorkflowResponse> {
  const res = await apiFetch<ApiWorkflowResponse>(`/api/v1/tasks/${taskId}/assignments/${assignmentId}/approve`, {
    method: 'PATCH',
    body: JSON.stringify(comment ? { comment } : {}),
  });
  invalidateTaskCaches(taskId);
  return res;
}

// UI-facing label for this action is always "Resubmit", never "Reject" (user
// preference) — but it calls the backend's /reject route, which is what
// actually drives the review -> resubmit transition.
export async function apiRequestResubmit(taskId: string, assignmentId: string, comment: string): Promise<ApiWorkflowResponse> {
  const res = await apiFetch<ApiWorkflowResponse>(`/api/v1/tasks/${taskId}/assignments/${assignmentId}/reject`, {
    method: 'PATCH',
    body: JSON.stringify({ comment }),
  });
  invalidateTaskCaches(taskId);
  return res;
}

// Same rules as apiRequestResubmit, run across a hand-picked batch with one
// shared comment — an assignee still at 'pending' (never submitted) or out
// of resubmit quota comes back in `skipped` rather than failing the request.
export async function apiBulkRequestResubmit(
  taskId: string,
  assignmentIds: string[],
  comment: string
): Promise<{ success: boolean; message: string; data: { succeeded: string[]; skipped: ApiBatchSkip[] } }> {
  const res = await apiFetch<{ success: boolean; message: string; data: { succeeded: string[]; skipped: ApiBatchSkip[] } }>(
    `/api/v1/tasks/${taskId}/assignments/bulk-resubmit`,
    { method: 'POST', body: JSON.stringify({ assignmentIds, comment }) }
  );
  invalidateTaskCaches(taskId);
  return res;
}


// ---------------------------------------------------------------------------
// Mentor weekly report
//
// Replaces the checklist/Q&A shape a mentor task used to come back in: a
// grid of the mentor's teams, each with a per-team judgement and a row of
// 0-5 ratings per student, plus the summary strip across the top. Lives
// under the task's own URL because a report is always one week's task.
// ---------------------------------------------------------------------------

export type ApiReportProjectStatus = 'on_track' | 'delayed' | 'ahead';
export type ApiReportTeamHealth = 'positive' | 'neutral' | 'negative';

export interface ApiWeeklyReportStudent {
  studentId: string;
  name: string;
  registrationNumber: string | null;
  batch: string | null;
  /** Rated here, but has since left the team — read-only history. */
  isFormerMember?: boolean;
  // null means "not rated yet", which is deliberately not the same as 0 —
  // an unfilled cell must stay visibly unfilled.
  techSkill: number | null;
  communication: number | null;
  overallPerformance: number | null;
}

export interface ApiWeeklyReportTeam {
  teamId: string;
  teamName: string;
  trackName: string;
  /** null when the team has no allocated project yet — a real state, not an error. */
  projectTitle: string | null;
  projectStatus: ApiReportProjectStatus | null;
  teamHealth: ApiReportTeamHealth | null;
  weeklyFeedback: string | null;
  /** What the project is built with this week — one list per team; everyone on it works the same project. Empty, never missing. */
  techStack: string[];
  /** Reported on here, but the team has since moved to another mentor — shown as history, not editable. */
  isFormerTeam?: boolean;
  students: ApiWeeklyReportStudent[];
  /** Only set on the admin's collated cross-mentor view — a mentor's own grid never needs to say whose it is. */
  mentorName?: string;
}

export interface ApiNoShowStudent {
  studentId: string;
  name: string;
  batch: string | null;
}

export interface ApiWeeklyReportSummary {
  teamCount: number;
  studentCount: number;
  /** One entry per week up to and including this task's, W1..Wn. */
  weeks: { week: number; label: string; onTrack: number; total: number }[];
  /** Students marked absent on a session inside this task's window — who, not just how many. */
  noShowStudents: ApiNoShowStudent[];
}

export interface ApiMyWeeklyReport {
  task: { id: string; title: string; description: string | null; week: string; start_date: string; deadline: string };
  assignment: { id: string; status: ApiAssignmentStatus };
  summary: ApiWeeklyReportSummary;
  teams: ApiWeeklyReportTeam[];
}

export interface ApiAllWeeklyReports {
  task: { id: string; title: string; description: string | null; week: string; start_date: string; deadline: string };
  mentors: {
    assignmentId: string;
    mentorId: string;
    mentorName: string;
    status: ApiAssignmentStatus;
    teamCount: number;
    /** Teams this mentor has actually put something in — not just teams that have a row. */
    filledTeams: number;
    /** This mentor's own strip, scoped to only the teams they hold now. */
    summary: ApiWeeklyReportSummary;
    teams: ApiWeeklyReportTeam[];
  }[];
}

/** Partial by design — send only what changed, everything omitted is left alone. */
export interface SaveWeeklyReportTeamPayload {
  projectStatus?: ApiReportProjectStatus | null;
  teamHealth?: ApiReportTeamHealth | null;
  weeklyFeedback?: string | null;
  techStack?: string[];
  students?: {
    studentId: string;
    techSkill?: number | null;
    communication?: number | null;
    overallPerformance?: number | null;
  }[];
}

export async function apiGetMyWeeklyReport(taskId: string): Promise<ApiMyWeeklyReport> {
  const res = await apiFetch<{ success: boolean; data: ApiMyWeeklyReport }>(
    `/api/v1/tasks/${taskId}/weekly-report`,
    { method: 'GET' }
  );
  return res.data;
}

// Returns the refreshed grid, so the caller never has to re-fetch to stay
// in step with what the server now holds.
export async function apiSaveWeeklyReportTeam(
  taskId: string,
  teamId: string,
  payload: SaveWeeklyReportTeamPayload
): Promise<ApiMyWeeklyReport> {
  const res = await apiFetch<{ success: boolean; message: string; data: ApiMyWeeklyReport }>(
    `/api/v1/tasks/${taskId}/weekly-report/${teamId}`,
    { method: 'PUT', body: JSON.stringify(payload) }
  );
  invalidateTaskCaches(taskId);
  return res.data;
}

export async function apiGetAllWeeklyReports(taskId: string): Promise<ApiAllWeeklyReports> {
  const res = await apiFetch<{ success: boolean; data: ApiAllWeeklyReports }>(
    `/api/v1/tasks/${taskId}/weekly-report/all`,
    { method: 'GET' }
  );
  return res.data;
}
