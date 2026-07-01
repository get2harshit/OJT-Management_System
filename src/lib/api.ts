import type { AuthResult, AuthUser, Cohort, CreateCohortBody, UpdateCohortBody, ApiUserRole } from './types';

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
