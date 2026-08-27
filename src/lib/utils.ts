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
