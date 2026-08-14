// Scheduling config + holidays + self-schedule permission. Same
// raw-passthrough convention as sessions.ts.
import { apiFetch, invalidateCached } from './client';

export interface ApiSchedulingConfig {
  cohort_id: string;
  working_days: number[];
  day_start_minute: number;
  day_end_minute: number;
  default_session_duration_minutes: number;
  min_gap_minutes: number;
  updated_by_id?: string;
  created_at?: string;
  updated_at?: string;
  /** Only set when the cohort has never had a config saved — these are hand-fed defaults, not a real row. */
  is_default?: boolean;
}

export interface UpdateSchedulingConfigBody {
  workingDays: number[];
  dayStartMinute: number;
  dayEndMinute: number;
  defaultSessionDurationMinutes: number;
  minGapMinutes: number;
}

export async function apiGetSchedulingConfig(cohortId: string): Promise<ApiSchedulingConfig> {
  const res = await apiFetch<{ data: ApiSchedulingConfig }>(`/api/v1/cohorts/${cohortId}/scheduling-config`);
  return res.data;
}

export async function apiUpdateSchedulingConfig(cohortId: string, body: UpdateSchedulingConfigBody): Promise<ApiSchedulingConfig> {
  const res = await apiFetch<{ data: ApiSchedulingConfig }>(`/api/v1/cohorts/${cohortId}/scheduling-config`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  invalidateCached('scheduling-config');
  return res.data;
}

export interface ApiHoliday {
  id: string;
  cohort_id: string | null;
  holiday_date: string;
  reason: string | null;
  created_by_id: string;
  created_at: string;
}

export async function apiListHolidays(cohortId: string, from?: string, to?: string): Promise<ApiHoliday[]> {
  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  const qs = query.toString();
  const res = await apiFetch<{ data: ApiHoliday[] }>(`/api/v1/cohorts/${cohortId}/holidays${qs ? `?${qs}` : ''}`);
  return res.data;
}

export async function apiAddHoliday(cohortId: string | 'global', date: string, reason?: string): Promise<ApiHoliday> {
  const res = await apiFetch<{ data: ApiHoliday }>(`/api/v1/cohorts/${cohortId}/holidays`, {
    method: 'POST',
    body: JSON.stringify({ date, reason }),
  });
  invalidateCached('holidays');
  return res.data;
}

export async function apiDeleteHoliday(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/cohorts/holidays/${id}`, { method: 'DELETE' });
  invalidateCached('holidays');
}

export async function apiGetSelfSchedulePermission(cohortId: string, mentorId: string): Promise<boolean> {
  const res = await apiFetch<{ data: { allowed: boolean } }>(`/api/v1/cohorts/${cohortId}/mentors/${mentorId}/self-schedule`);
  return res.data.allowed;
}

// One request for the whole cohort's roster instead of one per mentor — see
// SchedulingConfigService.getSelfSchedulePermissionsForCohort on the backend.
export async function apiGetSelfSchedulePermissionsForCohort(cohortId: string): Promise<Record<string, boolean>> {
  const res = await apiFetch<{ data: Record<string, boolean> }>(`/api/v1/cohorts/${cohortId}/self-schedule-permissions`);
  return res.data;
}

export async function apiSetSelfSchedulePermission(cohortId: string, mentorId: string, allowed: boolean): Promise<void> {
  await apiFetch<void>(`/api/v1/cohorts/${cohortId}/mentors/${mentorId}/self-schedule`, {
    method: 'PATCH',
    body: JSON.stringify({ allowed }),
  });
  invalidateCached('self-schedule');
}
