import type { ApiBatchManager } from '../types';
import { apiFetch } from './client';

export async function apiListBatchManagers(): Promise<ApiBatchManager[]> {
  return apiFetch<ApiBatchManager[]>('/api/v1/batch-managers');
}
