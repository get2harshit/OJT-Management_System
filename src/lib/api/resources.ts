// Resources a mentor shares with their own students in one OJT.
//
// Audience is resolved server-side from the sharing mentor's allocations —
// only their own students ever see a resource. A cohort-wide broadcast is a
// different thing (the admin's announcement composer).
import { apiFetch, invalidateCached, API_BASE, getStoredToken } from './client';

export type ApiResourceKind = 'link' | 'file';

export interface ApiSharedResource {
  id: string;
  cohort_id: string;
  shared_by_id: string;
  team_id: string | null;
  title: string;
  description: string | null;
  kind: ApiResourceKind;
  url: string | null;
  file_name: string | null;
  created_at: string;
  sharedBy: { id: string; full_name: string; email: string };
  team: { id: string; name: string } | null;
}

export interface ShareResourceBody {
  title: string;
  description?: string;
  /** Narrows it to one team; omit to reach every student of this mentor in the OJT. */
  teamId?: string;
  /** Exactly one of url or file. */
  url?: string;
  file?: File;
}

/**
 * Multipart, because a resource may carry a file. The shared apiFetch always
 * sets a JSON content-type, which would break the boundary header the browser
 * has to generate, so this posts directly.
 */
export async function apiShareResource(cohortId: string, body: ShareResourceBody): Promise<ApiSharedResource> {
  const form = new FormData();
  form.append('title', body.title);
  if (body.description) form.append('description', body.description);
  if (body.teamId) form.append('teamId', body.teamId);
  if (body.url) form.append('url', body.url);
  if (body.file) form.append('file', body.file);

  // Same direct-fetch shape apiDownloadBatchExport uses, for the same reason:
  // apiFetch always sets a JSON content-type, which would clobber the
  // multipart boundary the browser has to generate here.
  const token = getStoredToken();
  const res = await fetch(`${API_BASE}/api/v1/cohorts/${cohortId}/resources`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || json?.error || 'Could not share that resource');
  }
  invalidateCached('resources');
  return json.data as ApiSharedResource;
}

export async function apiGetMySharedResources(cohortId: string): Promise<ApiSharedResource[]> {
  const res = await apiFetch<{ data: ApiSharedResource[] }>(`/api/v1/cohorts/${cohortId}/resources/mine`);
  return res.data;
}

export async function apiGetResourcesSharedWithMe(cohortId: string): Promise<ApiSharedResource[]> {
  const res = await apiFetch<{ data: ApiSharedResource[] }>(`/api/v1/cohorts/${cohortId}/resources/shared-with-me`);
  return res.data;
}

/** A short-lived signed URL — the file is never proxied through this app. */
export async function apiGetResourceDownloadUrl(id: string): Promise<{ url: string; fileName: string | null }> {
  const res = await apiFetch<{ data: { url: string; fileName: string | null } }>(`/api/v1/resources/${id}/download`);
  return res.data;
}

export async function apiDeleteResource(id: string): Promise<void> {
  await apiFetch(`/api/v1/resources/${id}`, { method: 'DELETE' });
  invalidateCached('resources');
}
