import type { Project } from '../types';
import { apiFetch } from './client';
import { mapFrontendTrackToBackend, mapBackendTrackToFrontend } from './trackMapping';

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

export async function apiCreateProject(body: {
  title: string;
  description: string;
  track: string;
  techStack?: string[];
  problemStatement?: string;
  endUsersDefined?: string;
}): Promise<Project> {
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

export async function apiDeleteProject(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/projects/${id}`, {
    method: 'DELETE',
  });
}
