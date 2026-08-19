import { useEffect, useState } from 'react';
import { apiListHolidays, type ApiHoliday } from '../lib/api/schedulingConfig';

/** All holidays for a cohort — institution-wide and cohort-specific alike, same set the create/reschedule validation blocks against. */
export function useCalendarHolidays(cohortId: string): ApiHoliday[] {
  const [holidays, setHolidays] = useState<ApiHoliday[]>([]);

  useEffect(() => {
    if (!cohortId) {
      setHolidays([]);
      return;
    }
    let cancelled = false;
    apiListHolidays(cohortId)
      .then((h) => {
        if (!cancelled) setHolidays(h);
      })
      .catch(() => {
        if (!cancelled) setHolidays([]);
      });
    return () => {
      cancelled = true;
    };
  }, [cohortId]);

  return holidays;
}
