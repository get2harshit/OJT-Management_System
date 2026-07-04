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
