import { useEffect, useMemo, useState } from 'react';
import { apiGetSchedulingConfig, apiGetMentorSchedulingConfig, type ApiSchedulingConfig } from '../lib/api/schedulingConfig';
import { computeLocalBusinessHours, type BusinessHoursEntry } from '../lib/schedulingBusinessHours';

/**
 * Working-hours shading for the Sessions calendar — `false` while loading or
 * on a fetch failure (feature off, no shading, rather than an empty array
 * that FullCalendar would read as "every hour is non-business"). Resolves
 * to the given mentor's own effective config (their override, or the
 * cohort default if they have none) when a mentor is passed, and the
 * cohort default otherwise.
 */
export function useCalendarBusinessHours(cohortId: string, mentorId?: string): BusinessHoursEntry[] | false {
  const [config, setConfig] = useState<ApiSchedulingConfig | null>(null);

  useEffect(() => {
    if (!cohortId) {
      setConfig(null);
      return;
    }
    let cancelled = false;
    const request = mentorId ? apiGetMentorSchedulingConfig(cohortId, mentorId) : apiGetSchedulingConfig(cohortId);
    request
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch(() => {
        if (!cancelled) setConfig(null);
      });
    return () => {
      cancelled = true;
    };
  }, [cohortId, mentorId]);

  return useMemo(() => (config ? computeLocalBusinessHours(config) : false), [config]);
}
