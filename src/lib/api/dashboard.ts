import type { DashboardMetrics } from '../types';
import { apiFetch } from './client';

export async function apiGetDashboardMetrics(): Promise<DashboardMetrics> {
  return apiFetch<DashboardMetrics>('/api/v1/dashboard/metrics');
}
