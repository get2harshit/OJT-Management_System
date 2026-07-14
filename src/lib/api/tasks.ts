import { apiFetch } from './client';
import { mapFrontendTrackToBackend } from './trackMapping';

export interface ApiSubtask {
  id: string;
  task_id: string;
  title: string;
  created_at: string;
}

export interface ApiSubtaskProgress {
  id: string;
  assignment_id: string;
  subtask_id: string;
  status: 'pending' | 'progress' | 'completed';
  updated_at: string;
}

export interface ApiAssignment {
  id: string;
  task_id: string;
  assignee_id: string;
  status: 'pending' | 'progress' | 'completed';
  assigned_at: string;
  updated_at: string;
  assignee?: {
    id: string;
    full_name: string;
    role: string;
  };
  subtask_progress?: ApiSubtaskProgress[];
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
  assign_mode?: ApiTaskAssignMode | null;
  assigned_by_id: string;
  created_at: string;
  updated_at: string;
  assigner?: {
    id: string;
    full_name: string;
    role: string;
  };
  subtasks?: ApiSubtask[];
  assignments?: ApiAssignment[];
}

export type ApiTaskType = 'prd' | 'db_schema' | 'hld' | 'lld' | 'api_contract' | 'others';
export type ApiTaskAssignMode = 'team' | 'individual';

export interface CreateTaskPayload {
  title: string;
  description?: string;
  week?: string; // e.g. "Week 1"
  track?: string; // e.g. "product_development" (will be mapped automatically)
  startDate?: string; // ISO datetime string
  deadline?: string; // ISO datetime string
  targetRole?: 'student' | 'mentor' | 'batch_manager';
  taskType?: ApiTaskType;
  assignMode?: ApiTaskAssignMode;
  batch?: string;
  teamIds?: string[];
  assignees?: string[];
  subtasks?: string[];
}

// Backend's PUT /tasks/:id only persists these fields (see updateTaskSchema in
// task.routes.ts and TaskService.updateTask) — reassigning assignees/subtasks/
// targetRole/batch isn't supported on update, only at creation time.
export interface UpdateTaskPayload {
  title?: string;
  description?: string;
  week?: string;
  track?: string;
  deadline?: string;
}

export async function apiCreateTask(payload: CreateTaskPayload): Promise<{ success: boolean; message: string; data: ApiTask }> {
  const body: Record<string, unknown> = { ...payload } as Record<string, unknown>;
  if (payload.track) {
    body.track = mapFrontendTrackToBackend(payload.track);
  }
  return apiFetch<{ success: boolean; message: string; data: ApiTask }>('/api/v1/tasks', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function apiListTasks(): Promise<{ success: boolean; data: ApiTask[] }> {
  return apiFetch<{ success: boolean; data: ApiTask[] }>('/api/v1/tasks', {
    method: 'GET',
  });
}

export async function apiGetTask(id: string): Promise<{ success: boolean; data: ApiTask }> {
  return apiFetch<{ success: boolean; data: ApiTask }>(`/api/v1/tasks/${id}`, {
    method: 'GET',
  });
}

export async function apiUpdateTask(id: string, payload: UpdateTaskPayload): Promise<{ success: boolean; message: string; data: ApiTask }> {
  const body: Record<string, unknown> = { ...payload } as Record<string, unknown>;
  if (payload.track) {
    body.track = mapFrontendTrackToBackend(payload.track);
  }
  return apiFetch<{ success: boolean; message: string; data: ApiTask }>(`/api/v1/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function apiDeleteTask(id: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>(`/api/v1/tasks/${id}`, {
    method: 'DELETE',
  });
}

export async function apiUpdateAssignmentStatus(
  taskId: string,
  assignmentId: string,
  status: 'pending' | 'progress' | 'completed'
): Promise<{ success: boolean; message: string; data: ApiAssignment }> {
  return apiFetch<{ success: boolean; message: string; data: ApiAssignment }>(
    `/api/v1/tasks/${taskId}/assignments/${assignmentId}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }
  );
}

export async function apiUpdateSubtaskProgressStatus(
  taskId: string,
  assignmentId: string,
  subtaskId: string,
  status: 'pending' | 'progress' | 'completed'
): Promise<{ success: boolean; message: string; data: ApiSubtaskProgress }> {
  return apiFetch<{ success: boolean; message: string; data: ApiSubtaskProgress }>(
    `/api/v1/tasks/${taskId}/assignments/${assignmentId}/subtasks/${subtaskId}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }
  );
}
