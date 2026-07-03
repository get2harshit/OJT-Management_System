import type { AuthResult, AuthUser, Cohort, CreateCohortBody, UpdateCohortBody, ApiUserRole, Project } from './types';

// ── Base URL ────────────────────────────────────────────────────────────────────

const API_BASE = 'https://ojt-system-be-672553132888.asia-south1.run.app';

// ── Token helpers ───────────────────────────────────────────────────────────────

const TOKEN_KEY = 'ojt-auth-token';

export const getStoredToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setStoredToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearStoredToken = () => localStorage.removeItem(TOKEN_KEY);

// ── Fetch wrapper ───────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // 204 No Content (e.g., successful delete)
  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = body?.message || body?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return body as T;
}

// ── Auth API ────────────────────────────────────────────────────────────────────

export async function apiSignUp(
  email: string,
  password: string,
  fullName?: string,
  role?: ApiUserRole,
): Promise<AuthResult> {
  return apiFetch<AuthResult>('/api/v1/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, fullName, role }),
  });
}

export async function apiSignIn(
  email: string,
  password: string,
): Promise<AuthResult> {
  return apiFetch<AuthResult>('/api/v1/auth/signin', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function apiSignOut(): Promise<void> {
  return apiFetch<void>('/api/v1/auth/signout', {
    method: 'POST',
  });
}

export async function apiGetMe(): Promise<AuthUser> {
  return apiFetch<AuthUser>('/api/v1/auth/me');
}

export async function apiForgotPassword(email: string): Promise<{ success: boolean; message: string }> {
  return apiFetch('/api/v1/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

// ── Cohorts API ─────────────────────────────────────────────────────────────────

export async function apiListCohorts(): Promise<Cohort[]> {
  return apiFetch<Cohort[]>('/api/v1/cohorts');
}

export async function apiGetCohort(id: string): Promise<Cohort> {
  return apiFetch<Cohort>(`/api/v1/cohorts/${id}`);
}

export async function apiCreateCohort(body: CreateCohortBody): Promise<Cohort> {
  return apiFetch<Cohort>('/api/v1/cohorts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function apiUpdateCohort(id: string, body: UpdateCohortBody): Promise<Cohort> {
  return apiFetch<Cohort>(`/api/v1/cohorts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function apiDeleteCohort(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/cohorts/${id}`, {
    method: 'DELETE',
  });
}

// Helper functions to map frontend track string formats (e.g. "Product Development")
// to backend PostgreSQL enum strings (e.g. "product_development") and vice versa.
const mapFrontendTrackToBackend = (track?: string | null): string => {
  if (!track) return 'product_development';
  switch (track) {
    case 'Product Development': return 'product_development';
    case 'Application Development': return 'application_development';
    case 'Data Scientist': return 'data_scientist';
    case 'Open Source': return 'open_source';
    case 'Gen AI': return 'gen_ai';
    default: return track;
  }
};

const mapBackendTrackToFrontend = (track?: string | null): string => {
  if (!track) return 'Product Development';
  switch (track) {
    case 'product_development': return 'Product Development';
    case 'application_development': return 'Application Development';
    case 'data_scientist': return 'Data Scientist';
    case 'open_source': return 'Open Source';
    case 'gen_ai': return 'Gen AI';
    default: return track;
  }
};

// ── Cohorts Project Mapping API ──────────────────────────────────────────────────

export async function apiAddProjectsToCohort(cohortId: string, projectIds: string[]): Promise<void> {
  return apiFetch<void>(`/api/v1/cohorts/${cohortId}/projects`, {
    method: 'POST',
    body: JSON.stringify({ projectIds }),
  });
}

export async function apiGetProjectsForCohort(cohortId: string): Promise<Project[]> {
  const res = await apiFetch<any[]>(`/api/v1/cohorts/${cohortId}/projects`);
  return res.map(p => ({
    ...p,
    track: mapBackendTrackToFrontend(p.track),
    related_field: Array.isArray(p.techStack) ? p.techStack.join(', ') : (p.related_field || ''),
  }));
}

// ── Projects API ─────────────────────────────────────────────────────────────────

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
