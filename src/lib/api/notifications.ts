import { apiFetch } from './client';

export type NotificationType = 'announcement' | 'allocation' | 'submission' | 'task' | 'evaluation' | 'team_invite';
export type NotificationPriority = 'normal' | 'important' | 'urgent';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  isRead: boolean;
  createdAt: string;
  // Polymorphic pointer back to the source entity — a team_request id for
  // team_invite notifications, letting the UI wire Accept/Reject straight
  // to apiRespondToTeamRequest without a separate team-status fetch.
  referenceId: string | null;
}

interface RawNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  is_read: boolean;
  created_at: string;
  reference_id: string | null;
}

function mapNotification(raw: RawNotification): AppNotification {
  return {
    id: raw.id,
    type: raw.type,
    title: raw.title,
    message: raw.message,
    priority: raw.priority,
    isRead: raw.is_read,
    createdAt: raw.created_at,
    referenceId: raw.reference_id,
  };
}

// Admin/batch_manager — publishes an announcement, fanned out server-side to
// every active student in the cohort matching the (optional) batch/track.
export async function apiCreateAnnouncement(data: {
  cohortId: string;
  title: string;
  message: string;
  targetBatch?: string;
  targetTrack?: string;
  priority?: NotificationPriority;
}): Promise<{ recipientCount: number }> {
  const res = await apiFetch<{ data: { recipientCount: number } }>('/api/v1/notifications/announcements', {
    method: 'POST',
    body: JSON.stringify({
      cohort_id: data.cohortId,
      title: data.title,
      message: data.message,
      target_batch: data.targetBatch,
      target_track: data.targetTrack,
      priority: data.priority,
    }),
  });
  return res.data;
}

// Caller's own notifications, newest first — no polling, this is only ever
// called on mount or on an explicit manual refresh click.
export async function apiGetMyNotifications(): Promise<AppNotification[]> {
  const res = await apiFetch<{ data: RawNotification[] }>('/api/v1/notifications/my');
  return res.data.map(mapNotification);
}

export async function apiMarkNotificationRead(id: string): Promise<void> {
  await apiFetch(`/api/v1/notifications/${id}/read`, { method: 'PATCH' });
}

export async function apiMarkAllNotificationsRead(): Promise<void> {
  await apiFetch('/api/v1/notifications/read-all', { method: 'POST' });
}
