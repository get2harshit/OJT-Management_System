import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Clock, Users, XCircle } from 'lucide-react';
import Modal from './Modal';
import SpinnerSquare from './SpinnerSquare';
import {
  apiGetLiveSessionReport,
  apiSyncLiveAttendance,
  apiGetSessionAttendance,
  type ApiLiveSessionReport,
  type ApiSessionAttendance,
  type ApiAttendanceStatus,
} from '../lib/api/sessions';

const STATUS_TEXT_STYLES: Record<ApiAttendanceStatus, string> = {
  not_marked: 'text-gray-400',
  present: 'text-green-400',
  absent: 'text-red-400',
  excused: 'text-amber-400',
};

function formatDuration(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
}

function formatClock(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Signed, so "ran 20m longer" and "ran 20m shorter" don't print identically. */
function formatSignedMinutes(deltaMinutes: number): string {
  if (deltaMinutes === 0) return 'exact';
  const sign = deltaMinutes > 0 ? '+' : '−';
  return `${sign}${formatDuration(Math.abs(deltaMinutes) * 60)}`;
}

/** What the session was *planned* as, for the scheduled-vs-actual comparison. */
export interface ScheduledShape {
  scheduledDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

interface Props {
  sessionId: string;
  sessionTitle?: string;
  open: boolean;
  onClose: () => void;
  /**
   * The plan, so the room's real timings can be read against it. Passed in
   * rather than fetched: every caller already has the session row, and a
   * second request for numbers already on screen would be wasteful.
   */
  scheduled?: ScheduledShape;
  /**
   * Whether opening this also back-fills attendance for students still
   * 'not_marked'. On by default, which is what the Sessions pages want — that
   * back-fill is the whole reason a mentor opens this.
   *
   * Pass false anywhere the report is being read to *verify* something, most
   * of all under payouts: an admin checking what a mentor delivered must not
   * change the attendance that same payout is flagged against simply by
   * looking at it.
   */
  syncAttendance?: boolean;
}

/**
 * What actually happened in a session's live room — pulled from Polaris's
 * join/leave logs, not guessed from who was invited. Opening this also fills
 * in real attendance for anyone still 'not_marked' who cleared the presence
 * bar (see apiSyncLiveAttendance) — a mentor's own mark is never touched,
 * and `syncAttendance={false}` turns that write off entirely.
 */
export default function LiveSessionReportModal({
  sessionId,
  sessionTitle,
  open,
  onClose,
  scheduled,
  syncAttendance = true,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ApiLiveSessionReport | null>(null);
  const [attendanceByStudent, setAttendanceByStudent] = useState<Map<string, ApiSessionAttendance>>(new Map());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    setReport(null);

    (async () => {
      // Best-effort — the report below still renders even if the sync fails
      // (e.g. Polaris analytics aren't ready yet), it just won't have
      // auto-filled anything new that pass.
      if (syncAttendance) await apiSyncLiveAttendance(sessionId).catch(() => {});
      try {
        const [reportData, attendanceData] = await Promise.all([
          apiGetLiveSessionReport(sessionId),
          apiGetSessionAttendance(sessionId),
        ]);
        if (cancelled) return;
        setReport(reportData);
        setAttendanceByStudent(new Map(attendanceData.map((a) => [a.student_id, a])));
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : 'Could not load the live session report');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, sessionId, syncAttendance]);

  return (
    <Modal open={open} onClose={onClose} title={sessionTitle ? `Live report — ${sessionTitle}` : 'Live session report'} size="xl">
      {loading ? (
        <div className="py-10 flex justify-center">
          <SpinnerSquare size={32} />
        </div>
      ) : errorMessage ? (
        // An unavailable report is not a broken screen: this data is derived
        // from the live room, and marking attendance by hand never needed it.
        // Say that here, so nobody sits waiting for a retry to start working.
        <div className="py-8 px-4 flex flex-col items-center text-center gap-2">
          <AlertCircle size={24} className="text-amber-400" />
          <p className="text-sm text-gray-300 max-w-md">{errorMessage}</p>
          <p className="text-xs text-gray-500 max-w-md">
            This report is derived from the live room’s own join/leave logs. Attendance for this
            session can still be marked by hand from the Attendance page — nothing here blocks it.
          </p>
        </div>
      ) : report ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Duration" value={formatDuration(report.totalDurationSeconds)} icon={<Clock size={18} className="text-gold" />} tone="gold" />
            <StatTile label="Expected" value={String(report.totalExpected)} icon={<Users size={18} className="text-gray-300" />} tone="neutral" />
            <StatTile
              label={`Present (≥${report.attendanceThresholdPercent}%)`}
              value={String(report.presentCount)}
              icon={<CheckCircle size={18} className="text-green-400" />}
              tone="green"
            />
            <StatTile
              label="Below threshold"
              value={String(Math.max(0, report.totalExpected - report.presentCount))}
              icon={<XCircle size={18} className="text-red-400" />}
              tone="red"
            />
          </div>

          {scheduled && (
            // The plan beside the measurement. Kept as two labelled rows rather
            // than one "over/under by N" figure on purpose: the gap is only
            // meaningful once you can see which side it came from — a room that
            // opened late reads nothing like one that ran long.
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Scheduled vs actual</p>
              <div className="bg-zinc-900 border border-zinc-750 rounded-lg divide-y divide-zinc-800 text-xs">
                <ComparisonRow
                  label="Scheduled"
                  window={`${formatClock(scheduled.startTime)}–${formatClock(scheduled.endTime)}`}
                  duration={formatDuration(scheduled.durationMinutes * 60)}
                  muted
                />
                <ComparisonRow
                  label="Live room"
                  window={`${formatClock(report.sessionStart)}–${formatClock(report.sessionEnd)}`}
                  duration={formatDuration(report.totalDurationSeconds)}
                />
                <ComparisonRow
                  label="Difference"
                  window=""
                  duration={formatSignedMinutes(
                    Math.round(report.totalDurationSeconds / 60) - scheduled.durationMinutes
                  )}
                />
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Students</p>
            <div className="space-y-1.5">
              {report.students.length === 0 && <p className="text-xs text-gray-500">No teams were attached to this session.</p>}
              {report.students
                .slice()
                .sort((a, b) => b.percentPresent - a.percentPresent)
                .map((s) => {
                  const attendance = attendanceByStudent.get(s.studentId);
                  return (
                    <div key={s.studentId} className="flex items-center justify-between gap-3 bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="text-gray-200 font-medium truncate">{s.fullName}</p>
                        <p className="text-gray-500 truncate">{s.email}</p>
                      </div>
                      <div className="text-gray-400 w-28 text-right shrink-0 tabular-nums">
                        {s.joined ? `${formatClock(s.joinedAt)}–${formatClock(s.leftAt)}` : 'Never joined'}
                      </div>
                      <div className="w-14 text-right shrink-0 tabular-nums text-gray-300">{s.percentPresent}%</div>
                      <div className={`w-20 text-right shrink-0 font-semibold ${attendance ? STATUS_TEXT_STYLES[attendance.status] : 'text-gray-500'}`}>
                        {attendance ? attendance.status.replace('_', ' ') : '—'}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {report.otherParticipants.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Also in the room</p>
              <div className="space-y-1.5">
                {report.otherParticipants.map((p) => {
                  // Polaris starts its recording bot ("beam") under the
                  // mentor's own user id, then merges the two peers into one
                  // record and ADDS their times together — so this duration
                  // comes back at roughly twice the room's own length. There is
                  // no way to split it back apart from this response, and a
                  // number that is reliably wrong is worse than no number, so
                  // say we cannot measure it instead of printing the double.
                  const mergedWithRecorder = p.roles.includes('beam');
                  return (
                    <div key={p.userId} className="flex items-center justify-between gap-3 bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-xs">
                      <span className="text-gray-300 truncate">{p.name}</span>
                      <span className="text-gray-500">{p.roles.filter((r) => r !== 'beam').join(', ') || p.roles.join(', ')}</span>
                      {mergedWithRecorder ? (
                        <span
                          className="text-gray-500 shrink-0 italic"
                          title="Not measurable: the live service merges this person with its recording bot and sums both times, so the figure it reports is about double the real one."
                        >
                          not measurable
                        </span>
                      ) : (
                        <span className="text-gray-500 tabular-nums shrink-0">{formatDuration(p.durationSeconds)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

function ComparisonRow({
  label,
  window,
  duration,
  muted,
}: {
  label: string;
  window: string;
  duration: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className={muted ? 'text-gray-500' : 'text-gray-300'}>{label}</span>
      <span className="text-gray-500 tabular-nums ml-auto w-28 text-right">{window}</span>
      <span className={`tabular-nums w-20 text-right font-semibold ${muted ? 'text-gray-400' : 'text-gray-200'}`}>
        {duration}
      </span>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: 'gold' | 'green' | 'red' | 'neutral';
}) {
  const bg = { gold: 'bg-gold/10', green: 'bg-green-500/10', red: 'bg-red-500/10', neutral: 'bg-zinc-800' }[tone];
  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-3 flex items-center justify-between">
      <div>
        <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block">{label}</span>
        <span className="text-xl font-bold text-white mt-1 block tabular-nums">{value}</span>
      </div>
      <div className={`p-2 rounded-lg ${bg}`}>{icon}</div>
    </div>
  );
}
