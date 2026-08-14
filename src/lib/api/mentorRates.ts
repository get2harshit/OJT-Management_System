// Mentor pay rates. Append-only on the backend: changing a rate posts a new
// row with a later effective_from, so history is never rewritten and a
// session already taught keeps the rate it was scheduled under.
//
// Same raw-passthrough convention as sessions.ts / payouts.ts.
import { apiFetch, invalidateCached } from './client';

/** What one unit of a rate buys. The same number means very different money under each. */
export type ApiRateType = 'per_hour' | 'per_session' | 'per_team';

export const RATE_TYPE_LABELS: Record<ApiRateType, string> = {
  per_hour: 'Per Hour',
  per_session: 'Per Session',
  per_team: 'Per Team',
};

/** The unit a rate amount is priced in, for rendering next to an amount. */
export const RATE_TYPE_UNITS: Record<ApiRateType, string> = {
  per_hour: '/hour',
  per_session: '/session',
  per_team: '/team',
};

export interface ApiMentorRate {
  id: string;
  mentor_id: string;
  rate_amount: string;
  rate_type: ApiRateType;
  currency: 'INR' | 'USD';
  effective_from: string;
  note: string | null;
  set_by_id: string;
  created_at: string;
}

export interface SetMentorRateBody {
  rateAmount: number;
  rateType?: ApiRateType;
  currency?: 'INR' | 'USD';
  /** ISO datetime; defaults to now on the backend. */
  effectiveFrom?: string;
  note?: string;
}

/** Full rate history for a mentor, newest effective_from first. */
export async function apiListMentorRates(mentorId: string): Promise<ApiMentorRate[]> {
  const res = await apiFetch<{ data: ApiMentorRate[] }>(`/api/v1/mentors/${mentorId}/rates`);
  return res.data;
}

/**
 * Current rate for a set of mentors in one request, keyed by mentor id.
 * Used by the rates roster — asking per mentor is the N+1 that made the
 * scheduling-config page crawl on a large cohort.
 */
export async function apiGetCurrentRatesForMentors(mentorIds: string[]): Promise<Record<string, ApiMentorRate>> {
  if (mentorIds.length === 0) return {};
  const res = await apiFetch<{ data: Record<string, ApiMentorRate> }>(
    `/api/v1/mentors/rates/current?mentorIds=${mentorIds.join(',')}`
  );
  return res.data;
}

export async function apiSetMentorRate(mentorId: string, body: SetMentorRateBody): Promise<ApiMentorRate> {
  const res = await apiFetch<{ data: ApiMentorRate }>(`/api/v1/mentors/${mentorId}/rates`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  invalidateCached('mentor-rates');
  return res.data;
}
