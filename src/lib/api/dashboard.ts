import type { DashboardMetrics } from '../types';
import { apiFetch, cachedFetch } from './client';

// The dashboard tab unmounts/remounts on every switch away and back (see the
// panel index.tsx files' tab-switch pattern), re-fetching metrics each time
// — short-TTL cache smooths that out. No invalidation wired: these are
// aggregate stats, not critical to be instantly fresh after an action taken
// on some other tab.
export async function apiGetDashboardMetrics(): Promise<DashboardMetrics> {
  return cachedFetch('dashboard:metrics', 15_000, () => apiFetch<DashboardMetrics>('/api/v1/dashboard/metrics'));
}
