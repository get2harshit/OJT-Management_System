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

/** Where a row's duration figure actually came from. */
type DurationSource = 'measured' | 'entered' | 'assumed';

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
 * How long this session really ran, and on what evidence.
 *
 * Deliberately the same ranking as the backend's resolveActualDurationMinutes
 * — a hand-typed correction, else the live room's own window, else the
 * schedule — because two places answering "how long was it" differently is
 * how a screen ends up contradicting the payout computed from the same row.
 *
 * The live-room rung is the one that matters most here and is easy to miss:
 * actual_duration_minutes is only ever written at *completion*, so a session
 * that was held and then rescheduled or cancelled carries null forever, even
 * though both of its room timestamps are sitting right there on the row. Going
 * straight from null to the schedule is what reported an 80-minute booking for
 * a room that demonstrably ran three.
 */
function resolveDuration(session: ApiSession): { minutes: number; source: DurationSource } {
  const room = liveRoomMinutes(session);

  if (session.actual_duration_minutes != null) {
    const stored = session.actual_duration_minutes;
    // Completion resolved this already. If it disagrees with the room, the
    // difference is a human's correction — which is allowed to win, but is
    // worth labelling rather than passing off as a measurement.
    if (room != null) return { minutes: stored, source: stored === room ? 'measured' : 'entered' };
    return { minutes: stored, source: 'assumed' };
  }

  if (room != null) return { minutes: room, source: 'measured' };
  return { minutes: session.duration_minutes, source: 'assumed' };
}

function formatDuration(session: ApiSession): string {
  return formatExactDuration(resolveDuration(session).minutes);
}

const SOURCE_LABELS: Record<DurationSource, string> = {
  measured: 'Measured',
  entered: 'Entered',
  assumed: 'Assumed',
};

const SOURCE_STYLES: Record<DurationSource, string> = {
  measured: 'text-green-400',
  entered: 'text-amber-400',
  assumed: 'text-gray-500',
};

function durationBasis(session: ApiSession): string {
  const { source } = resolveDuration(session);
  const room = liveRoomMinutes(session);
  if (source === 'measured') return 'Measured from the live room’s own start and end.';
  if (source === 'entered') {
    return `Entered by hand when the session was completed. The live room itself ran ${formatExactDuration(room ?? 0)}.`;
  }
  return 'Scheduled length — the live room’s own duration was never recorded for this session.';
}

/** Actual minus scheduled, which is the figure a payout review is actually looking for. */
function varianceMinutes(session: ApiSession): number {
  return resolveDuration(session).minutes - session.duration_minutes;
}

function formatVariance(session: ApiSession): string {
  const delta = varianceMinutes(session);
  if (delta === 0) return 'exact';
  return `${delta > 0 ? '+' : '−'}${formatExactDuration(Math.abs(delta))}`;
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
              header: 'Duration',
              render: (session) => <span title={durationBasis(session)}>{formatDuration(session)}</span>,
              // Exported as plain minutes, not "1h 20m": a spreadsheet can sum
              // and chart a number, and the human-readable form is already on
              // screen for whoever is reading rather than calculating.
              exportValue: (session) => resolveDuration(session).minutes,
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
              header: 'Vs scheduled',
              render: (session) => {
                const delta = varianceMinutes(session);
                return (
                  <span className={delta === 0 ? 'text-gray-500' : delta > 0 ? 'text-amber-400' : 'text-blue-400'}>
                    {formatVariance(session)}
                  </span>
                );
              },
              exportValue: (session) => varianceMinutes(session),
            },
            {
              key: 'scheduledDuration',
              header: 'Scheduled length',
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