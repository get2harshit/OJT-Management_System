import { apiFetch, cachedFetch, invalidateCached } from './client';
import { mapFrontendTrackToBackend } from './trackMapping';

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
}

export interface ApiTask {
  id: string;
  title: string;
  description: string;
  week: string;
  track: string;
  start_date?: string | null;
  deadline: string;
  target_role: 'student' | 'mentor' | 'batch_manager';
  task_type?: ApiTaskType | null;
  category: ApiTaskCategory;
  assign_mode?: ApiTaskAssignMode | null;
  assigned_by_id: string;
  created_at: string;
  updated_at: string;
  assigner?: {
    id: string;
    full_name: string;
    role: string;
  };
  assignments?: ApiAssignment[];
}

export type ApiTaskType = 'prd' | 'db_schema' | 'hld' | 'lld' | 'api_contract' | 'others';
export type ApiTaskCategory = 'document_submission' | 'general' | 'link_submission';
export type ApiTaskAssignMode = 'team' | 'individual';

// Backend requires week/track/start_date/deadline/target_role/task_type/
// category/assign_mode unconditionally now (only `title` used to be
// required) — see createTaskSchema in task.routes.ts.
export interface CreateTaskPayload {
  title: string;
  description?: string;
  week: string; // e.g. "Week 1"
  track: string; // e.g. "product_development" (will be mapped automatically)
  start_date: string; // ISO datetime string, must be before deadline
  deadline: string; // ISO datetime string
  target_role: 'student' | 'mentor' | 'batch_manager';
  task_type: ApiTaskType;
  category: ApiTaskCategory;
  assign_mode: ApiTaskAssignMode;
  batch?: string;
  teamIds?: string[];
  assignees?: string[];
  // Required by the backend — every task belongs to exactly one cohort.
  cohort_id: string;
}

// Backend's PUT /tasks/:id only persists these fields (see updateTaskSchema in
// task.routes.ts and TaskService.updateTask) — reassigning assignees/
// targetRole/batch isn't supported on update, only at creation time.
export interface UpdateTaskPayload {
  title?: string;
  description?: string;
  week?: string;
  track?: string;
  deadline?: string;
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
  search?: string;
  sort?: 'deadline' | 'created_at' | 'week' | 'status';
  // Admins have no ojt_cohort_members row of their own, so the backend
  // can't infer "their" cohort the way it does for students/mentors —
  // without this, an admin gets an empty list back.
  cohort_id?: string;
}

export async function apiCreateTask(payload: CreateTaskPayload): Promise<{ success: boolean; message: string; data: ApiTask }> {
  const body: Record<string, unknown> = { ...payload } as Record<string, unknown>;
  if (payload.track) {
    body.track = mapFrontendTrackToBackend(payload.track);
  }
  const res = await apiFetch<{ success: boolean; message: string; data: ApiTask }>('/api/v1/tasks', {
    method: 'POST',
    body: JSON.stringify(body),
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
  const body: Record<string, unknown> = { ...payload } as Record<string, unknown>;
  if (payload.track) {
    body.track = mapFrontendTrackToBackend(payload.track);
  }
  const res = await apiFetch<{ success: boolean; message: string; data: ApiTask }>(`/api/v1/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  invalidateCached('tasks:list');
  invalidateCached(`tasks:get:${id}`);
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
