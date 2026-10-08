import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, Download, RotateCcw } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import DataTable from '../../components/DataTable';
import LiveSessionReportModal from '../../components/LiveSessionReportModal';
import PageLayout from '../../components/PageLayout';
import Select from '../../components/Select';
import {
  apiGetMentorById,
  apiGetLiveSessionReport,
  apiListSessions,
  type ApiSession,
  type ApiSessionStatus,
} from '../../lib/api';
import { exportToCSV } from '../../lib/csvExport';
import { formatExactDuration } from '../../lib/utils';

/**
 * How many live reports to fetch at once for the attendance export.
 *
 * Each one is a round trip from our backend on to Polaris, so this is a
 * courtesy limit on someone else's service as much as ours: a mentor with 200
 * hosted sessions firing 200 simultaneous requests is indistinguishable from
 * an attack, and the whole export fails together when it gets throttled.
 */
const DETAIL_FETCH_CONCURRENCY = 4;

/**
 * One row per student per session means every session-level figure below
 * repeats on each of that session's rows — so a five-student session reports
 * its room duration five times, and anyone summing that column gets five
 * times the real answer.
 *
 * Two columns make the file safe to analyse on its own rather than relying on
 * the reader to notice:
 *
 *   Session key          groups a session's rows together, and is what to
 *                        group or pivot by.
 *   First row of session  'yes' exactly once per session. Filter on it and
 *                        every session-level column sums correctly; ignore it
 *                        and the per-student rows are all still there.
 *
 * The figures are deliberately still repeated rather than blanked out on
 * continuation rows: a pivot table needs them on every row, and a blank reads
 * as "no data" rather than "same as above".
 */
const DETAIL_COLUMNS = [
  { key: 'sessionKey', header: 'Session key' },
  { key: 'firstRowOfSession', header: 'First row of session' },
  { key: 'date', header: 'Date' },
  { key: 'sessionTitle', header: 'Session' },
  { key: 'status', header: 'Status' },
  { key: 'scheduledStart', header: 'Scheduled start' },
  { key: 'scheduledEnd', header: 'Scheduled end' },
  { key: 'scheduledMinutes', header: 'Scheduled length (min)' },
  { key: 'roomStart', header: 'Room start' },
  { key: 'roomEnd', header: 'Room end' },
  { key: 'roomMinutes', header: 'Room duration (min)' },
  { key: 'expectedStudents', header: 'Students expected' },
  { key: 'presentStudents', header: 'Students present' },
  { key: 'studentName', header: 'Student' },
  { key: 'studentEmail', header: 'Student email' },
  { key: 'joined', header: 'Joined' },
  { key: 'joinedAt', header: 'Joined at' },
  { key: 'leftAt', header: 'Left at' },
  { key: 'presentMinutes', header: 'Present (min)' },
  { key: 'presentPercent', header: 'Present (%)' },
  { key: 'meetsThreshold', header: 'Meets attendance bar' },
  { key: 'note', header: 'Note' },
];

const FETCH_PAGE_SIZE = 100;

const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'rescheduled', label: 'Rescheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

// Was labelled "recording available / not available", which this filter never
// actually knew — it only tests whether the session has a Polaris live id, i.e.
// whether it was hosted in the platform at all. Renamed to what it tests. It
// stays useful because only a hosted session has a live report to open.
const HOSTING_OPTIONS = [
  { value: 'hosted', label: 'Hosted in platform' },
  { value: 'not_hosted', label: 'Not hosted in platform' },
];

function formatDate(date: string): string {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString();
}

function formatTime(time: string): string {
  return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** formatTime for the nullable timestamps, which the live report is full of. */
function formatTime2(time: string | null): string {
  return time ? formatTime(time) : '';
}

/**
 * Where a row's actual-duration figure came from — or that there isn't one.
 *
 * 'unknown' is a real answer and not a gap to be filled. The booking is NOT a
 * fallback here: substituting it is what made an eighty-minute booking stand in
 * for a room that ran three, and a column headed "actual" must never print a
 * number that was never observed.
 */
type DurationSource = 'measured' | 'entered' | 'unknown';

/**
 * Real elapsed minutes of the live room, or null when there is no honest
 * answer. Mirrors the backend's liveRoomMinutes, floor included: a room that
 * ran fifty seconds still happened.
 */
function liveRoomMinutes(session: ApiSession): number | null {
  if (!session.live_started_at || !session.live_ended_at) return null;
  const elapsedMs = new Date(session.live_ended_at).getTime() - new Date(session.live_started_at).getTime();
  if (elapsedMs <= 0) return null;
  return Math.max(1, Math.round(elapsedMs / 60_000));
}

/**
 * The figure a human typed at completion, when it can be told apart from a
 * machine-derived one.
 *
 * actual_duration_minutes is a *resolved* value — the backend writes it from a
 * typed-in correction, else the room, else the booking — and does not record
 * which. So it is identified by what it disagrees with: a stored value equal
 * to the room's own window came from the room, and one equal to the booking is
 * indistinguishable from the booking fallback. Only a value that matches
 * neither is certainly somebody's own number.
 *
 * This under-reports rather than over-reports: a mentor who typed exactly the
 * booked length is counted as unknown, not as entered. Claiming a human entry
 * we cannot prove would be the worse error of the two — and a stored value
 * equal to the booking is the booking either way, which is precisely what must
 * not be shown as an actual duration.
 */
function enteredMinutes(session: ApiSession): number | null {
  const stored = session.actual_duration_minutes;
  if (stored == null) return null;
  const room = liveRoomMinutes(session);
  if (room != null) return stored === room ? null : stored;
  return stored === session.duration_minutes ? null : stored;
}

/**
 * How long this session really ran, and on what evidence.
 *
 * The measurement wins. A room's own start and end are recorded by the
 * infrastructure with nobody's interest at stake; a typed-in figure is a claim
 * made by the person being paid for it, and on production data those claims
 * run above the room far more often than below it. So a hand-entered number no
 * longer displaces a measurement — it is kept, and shown in its own column, so
 * the two can be read against each other instead of one quietly replacing the
 * other.
 *
 * NOTE: this deliberately differs from the backend's
 * resolveActualDurationMinutes, which still ranks a typed-in correction above
 * the room and is what actual_duration_minutes — and therefore the payout — is
 * computed from. Until that ranking is changed to match, this view is the more
 * honest of the two and the money is not yet computed from it.
 */
function resolveDuration(session: ApiSession): { minutes: number | null; source: DurationSource } {
  const room = liveRoomMinutes(session);
  if (room != null) return { minutes: room, source: 'measured' };

  const entered = enteredMinutes(session);
  if (entered != null) return { minutes: entered, source: 'entered' };

  return { minutes: null, source: 'unknown' };
}

function formatDuration(session: ApiSession): string {
  const { minutes } = resolveDuration(session);
  return minutes == null ? '—' : formatExactDuration(minutes);
}

const SOURCE_LABELS: Record<DurationSource, string> = {
  measured: 'Measured',
  entered: 'Entered',
  unknown: 'Not recorded',
};

const SOURCE_STYLES: Record<DurationSource, string> = {
  measured: 'text-green-400',
  entered: 'text-amber-400',
  unknown: 'text-gray-500',
};

function durationBasis(session: ApiSession): string {
  const { source } = resolveDuration(session);
  if (source === 'measured') {
    const claimed = enteredMinutes(session);
    const base = 'Measured from the live room’s own start and end.';
    return claimed == null
      ? base
      : `${base} A duration of ${formatExactDuration(claimed)} was also entered by hand; the measurement is shown.`;
  }
  if (source === 'entered') {
    return 'Entered by hand at completion. The live room’s own duration was never recorded, so there is nothing to check it against.';
  }
  return `No actual duration exists for this session — the live room's start and end were not both recorded, and nothing was entered by hand. Its booking was ${formatExactDuration(session.duration_minutes)}, which is not the same thing.`;
}

/** Entered above the measurement is the shape worth looking at twice. */
function enteredExceedsMeasured(session: ApiSession): boolean {
  const room = liveRoomMinutes(session);
  const entered = enteredMinutes(session);
  return room != null && entered != null && entered > room;
}

/**
 * Actual minus booked — the figure a payout review is looking for, and null
 * where there is no actual to subtract from. A zero would read as "ran exactly
 * to plan", which is the opposite of "nobody recorded it".
 */
function varianceMinutes(session: ApiSession): number | null {
  const { minutes } = resolveDuration(session);
  return minutes == null ? null : minutes - session.duration_minutes;
}

function formatVariance(session: ApiSession): string {
  const delta = varianceMinutes(session);
  if (delta == null) return '—';
  if (delta === 0) return 'exact';
  return `${delta > 0 ? '+' : '−'}${formatExactDuration(Math.abs(delta))}`;
}

interface DurationTotals {
  sessions: number;
  /** Sessions that have an actual duration at all. The rest contribute no minutes. */
  knownSessions: number;
  /** Actual minutes, summed over the known sessions only. */
  minutes: number;
  /**
   * Booked minutes for those *same* known sessions.
   *
   * Separate from the booking total over every session so the variance below
   * compares like with like: measuring a partial set of actuals against the
   * whole set of bookings would report a shortfall that is really just the
   * sessions nobody timed.
   */
  knownScheduledMinutes: number;
  /** Booked minutes over every session, for context on how much is untimed. */
  scheduledMinutes: number;
  measuredMinutes: number;
  enteredMinutes: number;
  /**
   * Minutes claimed by hand above what the room actually recorded, summed over
   * the sessions where both figures exist. The single number a payout review
   * would otherwise have to find by reading every row.
   */
  overClaimedMinutes: number;
}

/**
 * Totals over a set of sessions, split by what each row's figure rests on.
 *
 * The split is the point. A bare "42h delivered" invites approval without
 * saying how much of it was actually observed — and on real data most of a
 * mentor's hours can be Assumed, meaning nobody recorded the room's end and
 * the booking is standing in for it. Printing the three beside the total is
 * what makes the number reviewable rather than just large.
 */
function sumDurations(sessions: ApiSession[]): DurationTotals {
  return sessions.reduce<DurationTotals>(
    (totals, session) => {
      const { minutes, source } = resolveDuration(session);
      const room = liveRoomMinutes(session);
      const claimed = enteredMinutes(session);
      const known = minutes != null;
      return {
        sessions: totals.sessions + 1,
        knownSessions: totals.knownSessions + (known ? 1 : 0),
        minutes: totals.minutes + (minutes ?? 0),
        knownScheduledMinutes: totals.knownScheduledMinutes + (known ? session.duration_minutes : 0),
        scheduledMinutes: totals.scheduledMinutes + session.duration_minutes,
        measuredMinutes: totals.measuredMinutes + (source === 'measured' ? (minutes ?? 0) : 0),
        enteredMinutes: totals.enteredMinutes + (source === 'entered' ? (minutes ?? 0) : 0),
        overClaimedMinutes:
          totals.overClaimedMinutes + (room != null && claimed != null && claimed > room ? claimed - room : 0),
      };
    },
    {
      sessions: 0,
      knownSessions: 0,
      minutes: 0,
      knownScheduledMinutes: 0,
      scheduledMinutes: 0,
      measuredMinutes: 0,
      enteredMinutes: 0,
      overClaimedMinutes: 0,
    }
  );
}

/** mentor_name_from_to — so a folder of these stays sortable and self-describing. */
function buildExportFilename(mentorName: string, from: string, to: string): string {
  const safeName = (mentorName || 'mentor').trim().replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '');
  return [safeName || 'mentor', from, to].filter(Boolean).join('_');
}

export default function MentorSessionHistoryPage() {
  const { mentorId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [mentorName, setMentorName] = useState('Mentor');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState('');
  const [hosting, setHosting] = useState('');
  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [reportSession, setReportSession] = useState<ApiSession | null>(null);
  const [detailProgress, setDetailProgress] = useState<{ done: number; total: number } | null>(null);
  const [detailError, setDetailError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiGetMentorById(mentorId)
      .then((mentor) => {
        if (!cancelled) setMentorName(mentor.fullName ?? mentor.email ?? 'Mentor');
      })
      .catch(() => {
        if (!cancelled) setMentorName('Mentor');
      });
    return () => {
      cancelled = true;
    };
  }, [mentorId]);

  useEffect(() => {
    if (!mentorId) {
      setLoading(false);
      setError('Mentor not found');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    (async () => {
      try {
        const filters = {
          mentorId,
          from: startDate || undefined,
          to: endDate || undefined,
          status: (status as ApiSessionStatus) || undefined,
          limit: FETCH_PAGE_SIZE,
        };
        const firstPage = await apiListSessions({ ...filters, page: 1 });
        const allSessions = [...firstPage.data];

        for (let currentPage = 2; currentPage <= firstPage.pagination.totalPages; currentPage += 1) {
          const result = await apiListSessions({ ...filters, page: currentPage });
          allSessions.push(...result.data);
          if (cancelled) return;
        }

        if (!cancelled) setSessions(allSessions);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load mentor sessions');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mentorId, startDate, endDate, status]);

  const changeStartDate = (value: string) => {
    setStartDate(value);
    if (endDate && value > endDate) setEndDate('');
  };

  const changeEndDate = (value: string) => {
    setEndDate(value);
  };

  const filteredSessions = sessions.filter((session) => {
    if (hosting === 'hosted' && session.live_session_id == null) return false;
    if (hosting === 'not_hosted' && session.live_session_id != null) return false;
    return true;
  });
  // When no date filter is set the range is taken from the rows actually being
  // exported, so the filename still says what is inside the file rather than
  // leaving the reader to open it to find out.
  const exportFilename = useMemo(() => {
    const dates = filteredSessions.map((session) => session.scheduled_date.slice(0, 10)).sort();
    return buildExportFilename(mentorName, startDate || dates[0] || '', endDate || dates[dates.length - 1] || '');
  }, [mentorName, startDate, endDate, filteredSessions]);

  const totals = useMemo(() => sumDurations(filteredSessions), [filteredSessions]);
  // The unfiltered figure too, so a filtered total says what it is a slice of
  // rather than looking like the mentor's whole output.
  const overallTotals = useMemo(() => sumDurations(sessions), [sessions]);
  const isFiltered = filteredSessions.length !== sessions.length;

  /**
   * The totals line written under the data rows, computed from whatever the
   * table is actually exporting — see DataTable's exportSummaryRows.
   *
   * A blank row goes first so the total reads as a separate block rather than
   * one more session, which is what stops someone selecting the column and
   * summing it with the total already inside.
   */
  const exportSummaryRows = (rows: ApiSession[]) => {
    const summed = sumDurations(rows);
    return [
      {},
      {
        date: `TOTAL (${summed.knownSessions} of ${summed.sessions} session${
          summed.sessions === 1 ? '' : 's'
        } timed)`,
        // Actual minutes and the booking for those same sessions, so the
        // variance on this row compares the same set on both sides.
        duration: summed.minutes,
        scheduledDuration: summed.knownScheduledMinutes,
        variance: summed.minutes - summed.knownScheduledMinutes,
        entered: summed.overClaimedMinutes > 0 ? `+${summed.overClaimedMinutes} over measured` : '',
        durationSource: `measured ${summed.measuredMinutes} / entered ${summed.enteredMinutes} / not recorded ${
          summed.sessions - summed.knownSessions
        } sessions`,
      },
    ];
  };

  /**
   * One row per student per session, from each session's own live report.
   *
   * Separate from the table's export on purpose. The table exports what is
   * already in memory; this has to fetch a report per session, so it is an
   * action somebody chooses rather than a column that quietly costs N
   * requests every time the page loads.
   *
   * A session whose report cannot be read still gets a row, carrying the
   * reason in the Note column. Dropping it would make the export look
   * complete while silently missing exactly the sessions worth asking about.
   */
  const exportAttendanceDetail = async () => {
    const hosted = filteredSessions.filter((session) => session.live_session_id != null);
    if (hosted.length === 0) {
      setDetailError('None of these sessions were hosted in the platform, so there is no attendance detail to export.');
      return;
    }

    setDetailError('');
    setDetailProgress({ done: 0, total: hosted.length });

    const rows: Record<string, unknown>[] = [];
    let failed = 0;

    const sessionBase = (session: ApiSession) => ({
      // Date plus scheduled start, which together name one of this mentor's
      // sessions unambiguously and stay readable — unlike the uuid, which is
      // the real key but useless to someone reading the sheet.
      sessionKey: `${formatDate(session.scheduled_date)} ${formatTime(session.start_time)}`,
      date: formatDate(session.scheduled_date),
      sessionTitle: session.title ?? '',
      status: session.status,
      scheduledStart: formatTime(session.start_time),
      scheduledEnd: formatTime(session.end_time),
      scheduledMinutes: session.duration_minutes,
    });

    for (let index = 0; index < hosted.length; index += DETAIL_FETCH_CONCURRENCY) {
      const slice = hosted.slice(index, index + DETAIL_FETCH_CONCURRENCY);
      const settled = await Promise.all(
        slice.map(async (session) => {
          try {
            return { session, report: await apiGetLiveSessionReport(session.id), error: null as string | null };
          } catch (err) {
            return { session, report: null, error: err instanceof Error ? err.message : 'Report unavailable' };
          }
        })
      );

      for (const { session, report, error: reportError } of settled) {
        if (!report) {
          failed += 1;
          rows.push({ ...sessionBase(session), firstRowOfSession: 'yes', note: reportError });
          continue;
        }

        const shared = {
          ...sessionBase(session),
          roomStart: formatTime2(report.sessionStart),
          roomEnd: formatTime2(report.sessionEnd),
          roomMinutes: Math.round(report.totalDurationSeconds / 60),
          expectedStudents: report.totalExpected,
          presentStudents: report.presentCount,
        };

        if (report.students.length === 0) {
          rows.push({ ...shared, firstRowOfSession: 'yes', note: 'No teams were attached to this session.' });
          continue;
        }

        report.students.forEach((student, studentIndex) => {
          rows.push({
            ...shared,
            firstRowOfSession: studentIndex === 0 ? 'yes' : 'no',
            studentName: student.fullName,
            studentEmail: student.email,
            joined: student.joined ? 'yes' : 'no',
            joinedAt: formatTime2(student.joinedAt),
            leftAt: formatTime2(student.leftAt),
            presentMinutes: Math.round(student.durationSeconds / 60),
            presentPercent: student.percentPresent,
            meetsThreshold: student.meetsAttendanceThreshold ? 'yes' : 'no',
          });
        });
      }

      setDetailProgress({ done: Math.min(index + slice.length, hosted.length), total: hosted.length });
    }

    // Totals have to be taken off the one-row-per-session set, not off every
    // row: room minutes repeat on each of a session's student rows, so summing
    // the column as printed multiplies a session by however many students
    // attended it. This is the same trap the first-row flag exists to let a
    // reader avoid, applied here so the file's own total is already right.
    const sessionRows = rows.filter((row) => row.firstRowOfSession === 'yes');
    const sumOf = (key: string) =>
      sessionRows.reduce((total, row) => total + (typeof row[key] === 'number' ? (row[key] as number) : 0), 0);
    const studentRows = rows.filter((row) => row.studentName);

    rows.push({}, {
      sessionKey: `TOTAL (${sessionRows.length} session${sessionRows.length === 1 ? '' : 's'}, ${studentRows.length} student row${studentRows.length === 1 ? '' : 's'})`,
      scheduledMinutes: sumOf('scheduledMinutes'),
      roomMinutes: sumOf('roomMinutes'),
      presentMinutes: studentRows.reduce(
        (total, row) => total + (typeof row.presentMinutes === 'number' ? (row.presentMinutes as number) : 0),
        0
      ),
    });

    exportToCSV(`${exportFilename}_attendance`, rows, DETAIL_COLUMNS);
    setDetailProgress(null);
    if (failed > 0) {
      setDetailError(
        `Exported, but ${failed} of ${hosted.length} session${failed === 1 ? '' : 's'} had no readable live report — see the Note column.`
      );
    }
  };

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setStatus('');
    setHosting('');
  };

  const returnToPayouts = () => {
    const query = new URLSearchParams();
    const cohortId = searchParams.get('cohortId');
    if (cohortId) query.set('cohortId', cohortId);
    query.set('tab', 'delivery');
    navigate(`/admin/dashboard/payouts?${query.toString()}`);
  };

  return (
    <PageLayout className="space-y-6">
      <div className="flex items-start gap-3">
        <button
          onClick={returnToPayouts}
          aria-label="Back to Work Delivered"
          title="Back to Work Delivered"
          className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">{mentorName} · Sessions</h1>
          <p className="text-gray-400 text-sm mt-1">Session history and recording availability</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-gray-400">
          <span className="block mb-1">Start date</span>
          <input
            type="date"
            value={startDate}
            max={endDate || undefined}
            onChange={(event) => changeStartDate(event.target.value)}
            className="bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
          />
        </label>
        <label className="text-xs text-gray-400">
          <span className="block mb-1">End date</span>
          <input
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(event) => changeEndDate(event.target.value)}
            className="bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
          />
        </label>
        <Select
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS}
          placeholder="All statuses"
          variant="filter"
          className="w-44"
        />
        <Select
          value={hosting}
          onChange={setHosting}
          options={HOSTING_OPTIONS}
          placeholder="All sessions"
          variant="filter"
          className="w-52"
        />
        <button
          type="button"
          onClick={clearFilters}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-zinc-750 text-gold border border-zinc-700 rounded-lg hover:bg-zinc-700 transition-colors shrink-0"
        >
          <RotateCcw size={14} />
          Clear filters
        </button>
        <button
          type="button"
          onClick={exportAttendanceDetail}
          disabled={detailProgress !== null}
          title="One row per student per session, fetched from each session's own live room log"
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-zinc-750 text-gray-300 border border-zinc-700 rounded-lg hover:bg-zinc-700 hover:text-white transition-colors shrink-0 disabled:opacity-50"
        >
          <Download size={14} />
          {detailProgress
            ? `Fetching ${detailProgress.done}/${detailProgress.total}...`
            : 'Export with attendance detail'}
        </button>
      </div>

      {detailError && (
        <p className="text-xs text-amber-400/90">{detailError}</p>
      )}

      {/* Sits above the table because it is the answer to the question this
          page gets opened for — how much did this mentor deliver — and the
          rows are the working behind it. Follows the filters, with the
          unfiltered figure kept in view so a slice never reads as the whole. */}
      {!error && (
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <Figure
            label="Sessions"
            value={String(totals.sessions)}
            sub={isFiltered ? `of ${overallTotals.sessions}` : undefined}
          />
          {/* Deliberately "Actual duration", and deliberately only the sessions
              that have one. A total that quietly folded in bookings for the
              untimed sessions would be the same lie this page exists to undo,
              just aggregated. The companion figure below says how many are
              missing, so the total is never mistaken for the whole. */}
          <Figure
            label="Actual duration"
            value={formatExactDuration(totals.minutes)}
            sub={isFiltered ? `of ${formatExactDuration(overallTotals.minutes)}` : undefined}
            strong
          />
          <Figure
            label="Not recorded"
            value={`${totals.sessions - totals.knownSessions} session${
              totals.sessions - totals.knownSessions === 1 ? '' : 's'
            }`}
            sub={`${formatExactDuration(totals.scheduledMinutes - totals.knownScheduledMinutes)} booked`}
            tone={totals.sessions - totals.knownSessions > 0 ? 'text-gray-400' : 'text-white'}
          />
          <div className="h-8 w-px bg-zinc-750 hidden sm:block" />
          {/* Booked minutes for the SAME sessions the actual total covers, so
              the comparison beside it is like for like. */}
          <Figure label="Booked (those sessions)" value={formatExactDuration(totals.knownScheduledMinutes)} />
          <Figure
            label="Vs booked"
            value={
              totals.minutes === totals.knownScheduledMinutes
                ? 'exact'
                : `${totals.minutes > totals.knownScheduledMinutes ? '+' : '−'}${formatExactDuration(
                    Math.abs(totals.minutes - totals.knownScheduledMinutes)
                  )}`
            }
          />
          <div className="h-8 w-px bg-zinc-750 hidden sm:block" />
          {/* How much of that total is actually evidenced, which is the part a
              payout review needs and the part a single figure hides. */}
          <Figure label="Measured" value={formatExactDuration(totals.measuredMinutes)} tone="text-green-400" />
          <Figure label="Entered" value={formatExactDuration(totals.enteredMinutes)} tone="text-amber-400" />
          {/* Only shown when there is something to show: a zero here is the
              normal case and a permanent "0m" would train people to ignore the
              figure that matters when it is not zero. */}
          {totals.overClaimedMinutes > 0 && (
            <>
              <div className="h-8 w-px bg-zinc-750 hidden sm:block" />
              <Figure
                label="Claimed over measured"
                value={`+${formatExactDuration(totals.overClaimedMinutes)}`}
                tone="text-red-400"
              />
            </>
          )}
        </div>
      )}

      {error ? (
        <p role="alert" className="py-8 text-center text-sm text-red-400">{error}</p>
      ) : (
        <DataTable
          columns={[
            {
              key: 'date',
              header: 'Date',
              render: (session) => (
                <div>
                  <p>{formatDate(session.scheduled_date)}</p>

                </div>
              ),
              exportValue: (session) => `${formatDate(session.scheduled_date)}`,
            },
            {
              key: 'startTime',
              header: 'Scheduled start',
              render: (session) => formatTime(session.start_time),
              exportValue: (session) => formatTime(session.start_time),
            },
            {
              key: 'endTime',
              header: 'Scheduled end',
              render: (session) => formatTime(session.end_time),
              exportValue: (session) => formatTime(session.end_time),
            },
            // The two columns above are the plan and were previously labelled
            // just "Start time"/"End time", which read as though they were what
            // happened. These two are what happened — kept beside them rather
            // than replacing them, because the gap between the pair is the
            // thing being verified here.
            {
              key: 'actualStart',
              header: 'Actual start',
              render: (session) => (session.live_started_at ? formatTime(session.live_started_at) : '—'),
              exportValue: (session) => (session.live_started_at ? formatTime(session.live_started_at) : ''),
            },
            {
              key: 'actualEnd',
              header: 'Actual end',
              render: (session) =>
                session.live_ended_at ? (
                  formatTime(session.live_ended_at)
                ) : session.live_started_at ? (
                  <span className="text-amber-400/80" title="The room was opened but never ended, so no end time was recorded.">
                    not ended
                  </span>
                ) : (
                  '—'
                ),
              exportValue: (session) =>
                session.live_ended_at ? formatTime(session.live_ended_at) : session.live_started_at ? 'not ended' : '',
            },
            {
              key: 'duration',
              header: 'Actual duration',
              render: (session) => {
                const { minutes } = resolveDuration(session);
                return (
                  <span className={minutes == null ? 'text-gray-600' : undefined} title={durationBasis(session)}>
                    {formatDuration(session)}
                  </span>
                );
              },
              // Exported as plain minutes, not "1h 20m": a spreadsheet can sum
              // and chart a number, and the human-readable form is already on
              // screen for whoever is reading rather than calculating.
              //
              // Blank, never zero, where there is no actual duration — a zero
              // would be summed and averaged as though the session ran for no
              // time, rather than skipped as unmeasured.
              exportValue: (session) => resolveDuration(session).minutes ?? '',
            },
            {
              // Kept beside the duration rather than folded into it: the whole
              // reason the measurement now wins is that this number is a claim
              // by the person being paid for it, and a claim is only checkable
              // while both figures are visible.
              key: 'entered',
              header: 'Entered by mentor',
              render: (session) => {
                const entered = enteredMinutes(session);
                if (entered == null) return <span className="text-gray-600">—</span>;
                return (
                  <span
                    className={enteredExceedsMeasured(session) ? 'text-amber-400' : 'text-gray-300'}
                    title={
                      enteredExceedsMeasured(session)
                        ? `Entered above the measured room duration of ${formatExactDuration(liveRoomMinutes(session) ?? 0)}.`
                        : 'Entered by hand at completion.'
                    }
                  >
                    {formatExactDuration(entered)}
                  </span>
                );
              },
              exportValue: (session) => enteredMinutes(session) ?? '',
            },
            {
              key: 'durationSource',
              header: 'Duration source',
              render: (session) => {
                const { source } = resolveDuration(session);
                return (
                  <span className={SOURCE_STYLES[source]} title={durationBasis(session)}>
                    {SOURCE_LABELS[source]}
                  </span>
                );
              },
              exportValue: (session) => SOURCE_LABELS[resolveDuration(session).source],
            },
            {
              key: 'variance',
              header: 'Vs booked',
              render: (session) => {
                const delta = varianceMinutes(session);
                const tone =
                  delta == null ? 'text-gray-600' : delta === 0 ? 'text-gray-500' : delta > 0 ? 'text-amber-400' : 'text-blue-400';
                return <span className={tone}>{formatVariance(session)}</span>;
              },
              exportValue: (session) => varianceMinutes(session) ?? '',
            },
            {
              key: 'scheduledDuration',
              header: 'Booked length',
              render: (session) => formatExactDuration(session.duration_minutes),
              exportValue: (session) => session.duration_minutes,
            },
            {
              key: 'scheduleStatus',
              header: 'Schedule vs completed',
              render: (session) => session.status === 'completed' ? 'Completed' : session.status === 'cancelled' ? 'Cancelled' : 'Scheduled',
              exportValue: (session) => session.status === 'completed' ? 'Completed' : session.status === 'cancelled' ? 'Cancelled' : 'Scheduled',
            },
            {
              key: 'status',
              header: 'Status',
              render: (session) => <span className="capitalize">{session.status}</span>,
              exportValue: (session) => session.status,
            },
            {
              key: 'detail',
              header: '',
              // Only a session hosted in the platform has a live room to report
              // on, so the button is simply absent otherwise rather than present
              // and failing — an off-platform session is not a broken one.
              render: (session) =>
                session.live_session_id != null ? (
                  <button
                    type="button"
                    onClick={() => setReportSession(session)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-zinc-700 text-gray-300 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    <BarChart3 size={13} />
                    Details
                  </button>
                ) : (
                  <span className="text-xs text-gray-600">off-platform</span>
                ),
              exportValue: (session) => (session.live_session_id != null ? 'hosted' : 'off-platform'),
            },
          ]}
          key={`${startDate}|${endDate}|${status}|${hosting}`}
          data={filteredSessions}
          loading={loading}
          exportFilename={exportFilename}
          exportSummaryRows={exportSummaryRows}
        />
      )}

      {reportSession && (
        // syncAttendance is off here on purpose: this panel exists to check
        // what a mentor delivered before it is paid for, and a check must not
        // alter the attendance that same payout is flagged against.
        <LiveSessionReportModal
          sessionId={reportSession.id}
          sessionTitle={reportSession.title ?? formatDate(reportSession.scheduled_date)}
          open
          onClose={() => setReportSession(null)}
          syncAttendance={false}
          scheduled={{
            scheduledDate: reportSession.scheduled_date,
            startTime: reportSession.start_time,
            endTime: reportSession.end_time,
            durationMinutes: reportSession.duration_minutes,
          }}
        />
      )}
    </PageLayout>
  );
}

function Figure({
  label,
  value,
  sub,
  tone,
  strong,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
  strong?: boolean;
}) {
  return (
    <div>
      <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block">{label}</span>
      <span className={`tabular-nums ${strong ? 'text-lg font-bold' : 'text-sm font-semibold'} ${tone ?? 'text-white'}`}>
        {value}
      </span>
      {sub && <span className="text-xs text-gray-500 ml-1.5 tabular-nums">{sub}</span>}
    </div>
  );
}