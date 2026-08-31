/**
 * Extracts the YYYY-MM-DD calendar date from a date string, whether it's
 * already plain (e.g. "2026-07-30") or a full ISO datetime
 * (e.g. "2026-07-30T00:00:00.000Z"). Avoids UTC/local timezone drift by
 * reading the digits directly instead of round-tripping through `Date`.
 */
export const toDateOnly = (dateStr: string): string => {
  if (!dateStr) return '';
  return dateStr.slice(0, 10);
};

/**
 * Formats a date string (plain or ISO datetime) as a human-readable date,
 * e.g. "26 August 2026".
 */
export const formatDateDisplay = (dateStr: string): string => {
  const dateOnly = toDateOnly(dateStr);
  if (!dateOnly) return '-';
  const [year, month, day] = dateOnly.split('-').map(Number);
  if (!year || !month || !day) return '-';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
};

export const formatDuration = (session: {
  actual_duration_minutes?: number | null;
  start_time: string;
  end_time: string;
}): string => {
  const minutes = session.actual_duration_minutes ?? Math.round((new Date(session.end_time).getTime() - new Date(session.start_time).getTime()) / 60_000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours > 0 ? `${hours}h${remainingMinutes > 0 ? ` ${remainingMinutes}m` : ''}` : `${remainingMinutes}m`;
};

/**
 * Calculates a user-friendly duration string between two dates.
 * E.g., "3 Months", "1 Month, 15 Days", "14 Days"
 */
export const getDurationString = (startDate: string, endDate: string): string => {
  if (!startDate || !endDate) return '';
  const startParts = toDateOnly(startDate).split('-').map(Number);
  const endParts = toDateOnly(endDate).split('-').map(Number);
  if (startParts.length !== 3 || endParts.length !== 3) return '';

  // Use UTC-anchored dates throughout so calendar math never drifts with the viewer's timezone.
  const start = new Date(Date.UTC(startParts[0], startParts[1] - 1, startParts[2]));
  const end = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2]));

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';

  const diffTime = end.getTime() - start.getTime();
  if (diffTime < 0) return 'Invalid dates';

  // Calculate difference in calendar years, months, and days
  let years = end.getUTCFullYear() - start.getUTCFullYear();
  let months = end.getUTCMonth() - start.getUTCMonth();
  let days = end.getUTCDate() - start.getUTCDate();

  if (days < 0) {
    months -= 1;
    // Get total days in the month prior to the end date's month
    const prevMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0));
    days += prevMonth.getUTCDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const totalMonths = years * 12 + months;

  const parts = [];
  if (totalMonths > 0) {
    parts.push(`${totalMonths} ${totalMonths === 1 ? 'Month' : 'Months'}`);
  }
  if (days > 0) {
    parts.push(`${days} ${days === 1 ? 'Day' : 'Days'}`);
  }

  return parts.join(', ') || '0 Days';
};

const IST_ZONE = 'Asia/Kolkata';

/**
 * A span of minutes spelled out exactly, as hours and minutes.
 *
 * Never a rounded decimal: "12.6h" is an approximation of 12h36m that reads
 * as if it doesn't quite add up against a session-by-session total, and a
 * 57-minute session shown as "0.9" reads as a number nobody measured.
 * "12h 36m" is the same figure, spelled out, and it reconciles by eye against
 * the rows it summarises.
 */
export const formatExactDuration = (minutes: number): string => {
  if (minutes <= 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours > 0
    ? `${hours}h${remainingMinutes > 0 ? ` ${remainingMinutes}m` : ''}`
    : `${remainingMinutes}m`;
};

/**
 * Formats an ISO datetime in IST (Asia/Kolkata) regardless of the viewer's
 * own browser timezone, or which zone the session itself was scheduled
 * under — a student must always see session times in IST. Same options
 * shape as `Date#toLocaleString`, with `timeZone` always forced to IST so a
 * caller can't accidentally drop it.
 */
export const formatInIST = (iso: string, opts?: Intl.DateTimeFormatOptions): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', { ...opts, timeZone: IST_ZONE });
};

const MS_PER_DAY = 86_400_000;

export type OjtWeekStatus = 'not_started' | 'running' | 'ended';

export interface OjtWeek {
  status: OjtWeekStatus;
  /** 1-based once running; 0 before the OJT starts. */
  weekNumber: number;
  totalWeeks: number;
  /** Ready to render, e.g. "Week 6 of 24". */
  label: string;
}

/** Reads a YYYY-MM-DD (or ISO) string as a UTC-midnight timestamp for day math. */
const utcMidnightOf = (dateStr: string): number | null => {
  const [year, month, day] = toDateOnly(dateStr).split('-').map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
};

/**
 * Today's calendar date in IST, as a UTC-midnight timestamp. The programme
 * runs on the org's calendar, so deriving "today" from the viewer's own clock
 * would put someone abroad — or anyone in the late-evening IST window, where
 * IST and UTC are already on different dates — in the wrong week.
 */
const todayInIST = (now: Date): number => {
  // en-CA formats as YYYY-MM-DD, which is what toDateOnly's parser expects.
  const istDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return utcMidnightOf(istDate) ?? 0;
};

/**
 * Which week of an OJT a given moment falls in, for the "Week 6 of 24" badge
 * every role sees.
 *
 * Weeks are anchored to the OJT's own start date — days 1-7 are Week 1
 * whatever weekday it began on. That's what a curriculum means by "week 3 of
 * the programme", and it stops Week 1 from being a 2-day stub when an OJT
 * starts on a Friday.
 *
 * Deliberately a different notion of "week" from the session cadence tracker
 * (backend `weekRange.ts`), which buckets by calendar Mon-Sun because it
 * answers a different question — how many sessions happened this calendar
 * week. The two can disagree by a few days; that is expected, not a bug.
 *
 * Returns null if the dates are missing or inverted, so a caller can simply
 * render nothing rather than a misleading week number.
 */
export const getOjtWeek = (startDate: string, endDate: string, now: Date = new Date()): OjtWeek | null => {
  const start = utcMidnightOf(startDate);
  const end = utcMidnightOf(endDate);
  if (start === null || end === null || end < start) return null;

  const totalDays = Math.floor((end - start) / MS_PER_DAY) + 1; // inclusive of both ends
  const totalWeeks = Math.max(1, Math.ceil(totalDays / 7));
  const today = todayInIST(now);

  if (today < start) {
    const daysToStart = Math.round((start - today) / MS_PER_DAY);
    return {
      status: 'not_started',
      weekNumber: 0,
      totalWeeks,
      label: daysToStart === 1 ? 'Starts tomorrow' : `Starts in ${daysToStart} days`,
    };
  }

  if (today > end) {
    return { status: 'ended', weekNumber: totalWeeks, totalWeeks, label: 'OJT complete' };
  }

  const weekNumber = Math.floor((today - start) / MS_PER_DAY / 7) + 1;
  return { status: 'running', weekNumber, totalWeeks, label: `Week ${weekNumber} of ${totalWeeks}` };
};

/**
 * Serializes rows into CSV text and triggers a browser download. Values are
 * quoted and escaped so commas, quotes, and newlines inside a cell can't
 * break the column structure.
 */
export const downloadCsv = (fileName: string, headers: string[], rows: (string | number)[][]): void => {
  const escapeCell = (cell: string | number): string => `"${String(cell).replace(/"/g, '""')}"`;
  const csvContent = [headers, ...rows].map(row => row.map(escapeCell).join(',')).join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * One calendar date (local, "YYYY-MM-DD") per requested weekday, each falling
 * within the 7-day window that starts at `startDateLocal` — inclusive of it
 * and the 6 days after. Every weekday (0=Sun..6=Sat) appears exactly once in
 * any 7 consecutive days, so this always returns exactly one date per
 * weekday asked for, sorted ascending.
 *
 * Stays entirely in local-date arithmetic (`new Date("YYYY-MM-DDT00:00:00")`
 * parses as local midnight, not UTC) so the weekday a user sees checked on
 * screen is the weekday the resulting session actually lands on — the same
 * discipline the single-session form already relies on by reading
 * datetime-local inputs as local time rather than doing its own UTC math.
 */
export const computeWeekOccurrenceDates = (startDateLocal: string, weekdays: number[]): string[] => {
  const anchor = new Date(`${startDateLocal}T00:00:00`);
  const anchorWeekday = anchor.getDay();

  const dateKey = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return weekdays
    .map((weekday) => {
      const offsetDays = (weekday - anchorWeekday + 7) % 7;
      const occurrence = new Date(anchor);
      occurrence.setDate(occurrence.getDate() + offsetDays);
      return dateKey(occurrence);
    })
    .sort();
};
