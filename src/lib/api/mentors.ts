import type { ApiMentor } from '../types';
import { apiFetch } from './client';

export async function apiListMentors(type?: 'internal' | 'external'): Promise<ApiMentor[]> {
  const url = type ? `/api/v1/mentors?type=${type}` : '/api/v1/mentors';
  return apiFetch<ApiMentor[]>(url);
}

