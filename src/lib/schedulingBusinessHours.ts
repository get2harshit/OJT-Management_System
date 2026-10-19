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

/** "HH:MM" -> minutes from midnight. */
const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

/**
 * A working-hours entry's end, in minutes. "23:59" is how a day running to
 * midnight is stored (a time input cannot say 24:00), and an end at or before
 * the start is one that wrapped to midnight — both mean 1440.
 */
function entryEndMinute(entry: BusinessHoursEntry): number {
  const end = toMinutes(entry.endTime);
  return end >= 1439 || end <= toMinutes(entry.startTime) ? 1440 : end;
}

/**
 * May a session START at this moment, by the working hours the calendar
 * shades? Same rule the server enforces (workingDayCheck.isWithinDayBounds):
 * a working day, at or after the day's start and before its end. The end of
 * the session is not limited here — a day running to midnight lets it run
 * on past midnight, and a day closing earlier is left for the server, which
 * says so in its own message. Hours that have not loaded (`false`) allow
 * anything, so a slow config never locks the calendar.
 */
export function startsInWorkingHours(start: Date, workingHours: BusinessHoursEntry[] | false): boolean {
  if (workingHours === false) return true;
  const minute = start.getHours() * 60 + start.getMinutes();
  return workingHours.some(
    (entry) => entry.daysOfWeek.includes(start.getDay()) && minute >= toMinutes(entry.startTime) && minute < entryEndMinute(entry)
  );
}

/**
 * Where the Week and Day grid begins: the working day's start, or earlier if
 * a session on screen starts before it (one booked before the hours were
 * narrowed must not vanish) — floored to the hour. Before the hours load, or
 * with no working day at all, it stays at 06:00 as it always was.
 */
export function calendarStartTime(workingHours: BusinessHoursEntry[] | false, sessionStarts: (string | Date)[]): string {
  if (workingHours === false || workingHours.length === 0) return '06:00:00';
  let earliest = Math.min(...workingHours.map((entry) => toMinutes(entry.startTime)));
  for (const value of sessionStarts) {
    const start = new Date(value);
    if (!Number.isNaN(start.getTime())) earliest = Math.min(earliest, start.getHours() * 60 + start.getMinutes());
  }
  return `${pad(Math.floor(earliest / 60))}:00:00`;
}
