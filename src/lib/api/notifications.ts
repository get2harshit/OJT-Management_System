import { apiFetch } from './client';

// Mirrors the ojt_notification_type enum. 'session' and 'payout' arrived with
// session scheduling and were already being switched on by all three panels'
// click handlers — the type is what had not caught up, so those branches were
// unreachable as far as TypeScript was concerned.
export type NotificationType =
  | 'announcement'
  | 'allocation'
  | 'submission'
  | 'task'
  | 'evaluation'
  | 'team_invite'
  | 'session'
  | 'payout';
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
}): Promise<{ announcementId: string; recipientCount: number }> {
  const res = await apiFetch<{ data: { announcementId: string; recipientCount: number } }>('/api/v1/notifications/announcements', {
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
//
// `type` narrows server-side rather than here. The newest 50 of every type can
// legitimately be all task notifications, so filtering the response would show
// an empty list to somebody who does have announcements — a wrong answer, not
// just a wasteful one.
export async function apiGetMyNotifications(
  filters?: { type?: NotificationType; limit?: number }
): Promise<AppNotification[]> {
  const query = new URLSearchParams();
  if (filters?.type) query.set('type', filters.type);
  if (filters?.limit) query.set('limit', String(filters.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const res = await apiFetch<{ data: RawNotification[] }>(`/api/v1/notifications/my${suffix}`);
  return res.data.map(mapNotification);
}

export async function apiMarkNotificationRead(id: string): Promise<void> {
  await apiFetch(`/api/v1/notifications/${id}/read`, { method: 'PATCH' });
}

export async function apiMarkAllNotificationsRead(): Promise<void> {
  await apiFetch('/api/v1/notifications/read-all', { method: 'POST' });
}

// ── Announcements as things, not just as delivered copies ────────────────────

/** One published announcement, as opposed to the copies sitting in students' feeds. */
export interface PastAnnouncement {
  id: string;
  title: string;
  message: string;
  priority: NotificationPriority;
  // Who it was aimed at when it went out. A record of the past, so it stays as
  // it was even if the batch or track roster changes afterwards.
  target_batch: string | null;
  track: { id: string; name: string; slug: string } | null;
  recipient_count: number;
  created_at: string;
  updated_at: string;
  creator: { id: string; full_name: string; email: string } | null;
}

// Admin/batch_manager — this OJT's announcements, newest first. Paginated
// server-side: a cohort accumulates these across its whole run.
export async function apiListAnnouncements(
  cohortId: string,
  params: { page: number; limit: number }
): Promise<{ data: PastAnnouncement[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  return apiFetch(`/api/v1/notifications/announcements/cohort/${cohortId}?${query.toString()}`);
}

// Corrects an announcement and every copy already delivered, so a student
// rereading it sees the correction rather than the mistake. The audience is
// not editable — it records who this actually went to.
export async function apiUpdateAnnouncement(
  id: string,
  data: { title: string; message: string; priority?: NotificationPriority }
): Promise<void> {
  await apiFetch(`/api/v1/notifications/announcements/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// Withdraws it — removed from students' notifications as well as from the list.
export async function apiDeleteAnnouncement(id: string): Promise<void> {
  await apiFetch(`/api/v1/notifications/announcements/${id}`, { method: 'DELETE' });
}
