import type { ApiMentor } from '../types';
import { apiFetch } from './client';

export async function apiListMentors(): Promise<ApiMentor[]> {
  return apiFetch<ApiMentor[]>('/api/v1/mentors');
}
