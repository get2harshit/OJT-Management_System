import type { Project } from '../types';
import { apiFetch } from './client';
import { mapFrontendTrackToBackend, mapBackendTrackToFrontend } from './trackMapping';

// Returns the trimmed list shape (id/title/problemStatement/track/techStack
// — no description). When called as a student, the backend also silently
// scopes results to that student's own batch year.
export async function apiListProjects(track?: string): Promise<Project[]> {
  const apiTrack = track ? mapFrontendTrackToBackend(track) : undefined;
  const url = apiTrack ? `/api/v1/projects?track=${apiTrack}` : '/api/v1/projects';
  const res = await apiFetch<any[]>(url);
  return res.map(p => ({
    ...p,
    track: mapBackendTrackToFrontend(p.track),
    related_field: Array.isArray(p.techStack) ? p.techStack.join(', ') : (p.related_field || ''),
  }));
}

// Full project record (description, endUsersDefined, batch, createdAt) —
// only available one at a time, via this endpoint.
export async function apiGetProject(id: string): Promise<Project> {
  const p = await apiFetch<any>(`/api/v1/projects/${id}`);
  return {
    ...p,
    track: mapBackendTrackToFrontend(p.track),
    related_field: Array.isArray(p.techStack) ? p.techStack.join(', ') : (p.related_field || ''),
  };
}

export interface ProjectCreateInput {
  title: string;
  description?: string;
  track: string;
  techStack?: string[];
  problemStatement?: string;
  endUsersDefined?: string;
}

export async function apiCreateProject(body: ProjectCreateInput): Promise<Project> {
  const payload = {
    ...body,
    track: mapFrontendTrackToBackend(body.track),
  };
  const p = await apiFetch<any>('/api/v1/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return {
    ...p,
    track: mapBackendTrackToFrontend(p.track),
    related_field: Array.isArray(p.techStack) ? p.techStack.join(', ') : (p.related_field || ''),
  };
}

// All-or-nothing on the backend — if any row fails validation, none of the
// batch is created. Used by the project CSV importer instead of looping
// apiCreateProject, so a bad row can't leave a half-imported catalog.
export async function apiCreateProjectsBulk(items: ProjectCreateInput[]): Promise<Project[]> {
  const payload = {
    projects: items.map(item => ({
      ...item,
      track: mapFrontendTrackToBackend(item.track),
    })),
  };
  const res = await apiFetch<any[]>('/api/v1/projects/bulk', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.map(p => ({
    ...p,
    track: mapBackendTrackToFrontend(p.track),
    related_field: Array.isArray(p.techStack) ? p.techStack.join(', ') : (p.related_field || ''),
  }));
}

export async function apiDeleteProject(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/projects/${id}`, {
    method: 'DELETE',
  });
}
