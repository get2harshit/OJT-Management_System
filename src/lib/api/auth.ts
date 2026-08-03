import type { AuthResult, AuthUser, ApiUserRole } from '../types';
import { apiFetch } from './client';

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

// Second half of the Google redirect. Supabase hands the session to the
// browser, never to our backend, so the browser has to pass it on — the
// backend verifies it with Supabase before trusting anything on it, and only
// then issues the same session cookies the password flow uses.
export async function apiGoogleSignIn(
  accessToken: string,
  refreshToken: string,
): Promise<AuthResult> {
  return apiFetch<AuthResult>('/api/v1/auth/google', {
    method: 'POST',
    body: JSON.stringify({ accessToken, refreshToken }),
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
