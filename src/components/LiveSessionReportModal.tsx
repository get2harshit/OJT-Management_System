import { useEffect, useState } from 'react';
import { CheckCircle, Clock, Users, XCircle } from 'lucide-react';
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

interface Props {
  sessionId: string;
  sessionTitle?: string;
  open: boolean;
  onClose: () => void;
}

/**
 * What actually happened in a session's live room — pulled from Polaris's
 * join/leave logs, not guessed from who was invited. Opening this also fills
 * in real attendance for anyone still 'not_marked' who cleared the presence
 * bar (see apiSyncLiveAttendance) — a mentor's own mark is never touched.
 */
export default function LiveSessionReportModal({ sessionId, sessionTitle, open, onClose }: Props) {
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
      await apiSyncLiveAttendance(sessionId).catch(() => {});
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
  }, [open, sessionId]);

  return (
    <Modal open={open} onClose={onClose} title={sessionTitle ? `Live report — ${sessionTitle}` : 'Live session report'} size="xl">
      {loading ? (
        <div className="py-10 flex justify-center">
          <SpinnerSquare size={32} />
        </div>
      ) : errorMessage ? (
        <p className="text-sm text-gray-400 py-6 text-center">{errorMessage}</p>
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
                {report.otherParticipants.map((p) => (
                  <div key={p.userId} className="flex items-center justify-between gap-3 bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-xs">
                    <span className="text-gray-300 truncate">{p.name}</span>
                    <span className="text-gray-500">{p.roles.filter((r) => r !== 'beam').join(', ') || p.roles.join(', ')}</span>
                    <span className="text-gray-500 tabular-nums shrink-0">{formatDuration(p.durationSeconds)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
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
