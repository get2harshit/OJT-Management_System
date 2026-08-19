import type { ApiHoliday } from './api/schedulingConfig';

const HOLIDAY_BACKGROUND_COLOR = 'rgba(239, 68, 68, 0.16)';

export interface HolidayBackgroundEvent {
  id: string;
  start: string;
  allDay: true;
  display: 'background';
  backgroundColor: string;
  title: string;
}

/** Renders each holiday as a full-day background tint on the Sessions calendar. */
export function computeHolidayBackgroundEvents(holidays: ApiHoliday[]): HolidayBackgroundEvent[] {
  return holidays.map((h) => ({
    id: `holiday-${h.id}`,
    start: h.holiday_date.slice(0, 10),
    allDay: true,
    display: 'background',
    backgroundColor: HOLIDAY_BACKGROUND_COLOR,
    title: h.reason || 'Holiday',
  }));
}

/** YYYY-MM-DD from a Date's own local fields — never through toISOString, which would shift the day at IST-ahead-of-UTC offsets. */
export function localDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
