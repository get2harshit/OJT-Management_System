import type { ApiSchedulingConfig } from './api/schedulingConfig';

export interface BusinessHoursEntry {
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
}

// Interprets `anchorDate`'s calendar day plus `minutesFromMidnight` as
// wall-clock time in `timeZone`, and returns the real UTC instant that
// refers to — the standard "guess, then correct for the zone's actual
// offset at that instant" trick, since Intl only converts UTC -> zone
// directly, never the other way.
function zoneMinutesToUtcInstant(anchorDate: Date, minutesFromMidnight: number, timeZone: string): Date {
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();
  const day = anchorDate.getDate();
  const hour = Math.floor(minutesFromMidnight / 60);
  const minute = minutesFromMidnight % 60;
  const guessUtc = Date.UTC(year, month, day, hour, minute);

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(guessUtc));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const guessReadsAsInZone = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));

  return new Date(guessUtc - (guessReadsAsInZone - guessUtc));
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Converts a working-hours config (which may be in a mentor's own non-local
 * IANA zone) into FullCalendar's `businessHours` shape, expressed in the
 * *browser's* zone — the calendar always renders event times in the
 * viewer's local zone, so the shading has to match that, not the config's
 * own zone. This is a visual hint only: the real create/reschedule calls
 * still re-validate against the config's actual zone server-side, so any
 * imprecision here (e.g. right at a DST transition) never causes a wrong
 * booking, only a slightly-off highlight.
 */
export function computeLocalBusinessHours(config: ApiSchedulingConfig): BusinessHoursEntry[] {
  const anchorSunday = new Date();
  anchorSunday.setHours(0, 0, 0, 0);
  anchorSunday.setDate(anchorSunday.getDate() - anchorSunday.getDay());

  const entries: BusinessHoursEntry[] = [];
  for (const dayOfWeek of config.working_days) {
    const anchorDate = new Date(anchorSunday);
    anchorDate.setDate(anchorSunday.getDate() + dayOfWeek);

    const start = zoneMinutesToUtcInstant(anchorDate, config.day_start_minute, config.timezone);
    const end = zoneMinutesToUtcInstant(anchorDate, config.day_end_minute, config.timezone);

    // Both ends are anchored to the same source day; using the start's own
    // local weekday keeps the (rare) case where a zone shift pushes the
    // range across a local midnight from splitting into two entries.
    entries.push({
      daysOfWeek: [start.getDay()],
      startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
      endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
    });
  }
  return entries;
}
