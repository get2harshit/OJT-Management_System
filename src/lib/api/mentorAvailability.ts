// A mentor's own declared recurring weekly availability, scoped per cohort.
// Same raw-passthrough convention as sessions.ts/schedulingConfig.ts.
import { apiFetch, invalidateCached } from './client';

export interface ApiAvailabilitySlot {
  id: string;
  mentor_id: string;
  cohort_id: string;
  day_of_week: number; // 0=Sun..6=Sat
  start_minute: number;
  end_minute: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AvailabilitySlotInput {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  isActive?: boolean;
}

export async function apiGetMyAvailability(cohortId: string): Promise<ApiAvailabilitySlot[]> {
  const res = await apiFetch<{ data: ApiAvailabilitySlot[] }>(`/api/v1/mentors/me/availability?cohortId=${cohortId}`);
  return res.data;
}

// Full replace, not a merge — send the complete set of slots to keep.
export async function apiSetMyAvailability(cohortId: string, slots: AvailabilitySlotInput[]): Promise<ApiAvailabilitySlot[]> {
  const res = await apiFetch<{ data: ApiAvailabilitySlot[] }>(`/api/v1/mentors/me/availability?cohortId=${cohortId}`, {
    method: 'PUT',
    body: JSON.stringify({ slots }),
  });
  invalidateCached('mentor-availability');
  return res.data;
}
