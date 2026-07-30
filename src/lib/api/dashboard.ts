import type { DashboardMetrics } from '../types';
import { apiFetch, cachedFetch } from './client';

interface DashboardMetricsFilters {
  cohortId?: string;
  batch?: string;
  /** Track slug, e.g. "gen_ai". */
  track?: string;
}

// The dashboard tab unmounts/remounts on every switch away and back (see the
// panel index.tsx files' tab-switch pattern), re-fetching metrics each time
// — short-TTL cache smooths that out. No invalidation wired: these are
// aggregate stats, not critical to be instantly fresh after an action taken
// on some other tab.
//
// The backend already computes these counts filtered by cohort/batch/track
// server-side — passing filters through here means the stat cards never
// need to fetch a full roster just to derive a count client-side.
export async function apiGetDashboardMetrics(filters: DashboardMetricsFilters = {}): Promise<DashboardMetrics> {
  const query = new URLSearchParams();
  if (filters.cohortId) query.set('cohortId', filters.cohortId);
  if (filters.batch) query.set('batch', filters.batch);
  if (filters.track) query.set('track', filters.track);
  const qs = query.toString();
  const cacheKey = `dashboard:metrics:${qs || 'all'}`;
  return cachedFetch(cacheKey, 15_000, () =>
    apiFetch<DashboardMetrics>(`/api/v1/dashboard/metrics${qs ? `?${qs}` : ''}`)
  );
}
