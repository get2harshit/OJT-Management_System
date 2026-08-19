import { useState, useEffect, useCallback, useMemo } from 'react';
import { Check, X, Clock, Users, CheckCircle, XCircle, MinusCircle, History } from 'lucide-react';
import DataTable from './DataTable';
import Select from './Select';
import SpinnerSquare from './SpinnerSquare';
import Modal from './Modal';
import {
  apiGetSessionAttendance,
  apiMarkAttendance,
  apiBulkMarkAttendance,
  apiGetAttendanceHistory,
  type ApiSession,
  type ApiSessionAttendance,
  type ApiAttendanceStatus,
  type ApiSessionAttendanceHistory,
} from '../lib/api';
import { useToast } from '../toast';

const STATUS_TEXT_STYLES: Record<ApiAttendanceStatus, string> = {
  not_marked: 'text-gray-400',
  present: 'text-green-400',
  absent: 'text-red-400',
  excused: 'text-amber-400',
};

interface SessionAttendancePanelProps {
  /**
   * Fetches just the given date's sessions, already scoped by the caller
   * (admin passes every session in the cohort, mentor passes only their
   * own) — the panel never pulls a wider range than the day on screen and
   * filters client-side.
   */
  loadSessionsForDate: (date: string) => Promise<ApiSession[]>;
}

const STATUS_STYLES: Record<ApiAttendanceStatus, string> = {
  not_marked: 'text-gray-500 hover:text-white hover:bg-zinc-850',
  present: 'bg-green-600 text-white shadow-sm',
  absent: 'bg-zinc-750 text-red-400 shadow-sm border border-red-500/20',
  excused: 'bg-amber-500/10 text-amber-400 shadow-sm border border-amber-500/20',
};

function sessionLabel(s: ApiSession): string {
  const time = new Date(s.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const who = s.teams.map((t) => t.team.name).join(', ') || s.mentor.full_name;
  return `${time} — ${s.title || who}`;
}

export default function SessionAttendancePanel({ loadSessionsForDate }: SessionAttendancePanelProps) {
  const { showSuccess, showError } = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [sessionsForDate, setSessionsForDate] = useState<ApiSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [rows, setRows] = useState<ApiSessionAttendance[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [marking, setMarking] = useState(false);
  const [historyFor, setHistoryFor] = useState<ApiSessionAttendance | null>(null);
  const [history, setHistory] = useState<ApiSessionAttendanceHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    setLoadingSessions(true);
    loadSessionsForDate(selectedDate)
      .then((list) => {
        const sorted = [...list].sort((a, b) => a.start_time.localeCompare(b.start_time));
        setSessionsForDate(sorted);
        setSelectedSessionId((prev) => (sorted.some((s) => s.id === prev) ? prev : sorted[0]?.id ?? ''));
      })
      .catch((err) => showError(err instanceof Error ? err.message : 'Failed to load sessions'))
      .finally(() => setLoadingSessions(false));
  }, [selectedDate, loadSessionsForDate, showError]);

  const loadRows = useCallback(() => {
    if (!selectedSessionId) {
      setRows([]);
      return;
    }
    setLoadingRows(true);
    apiGetSessionAttendance(selectedSessionId)
      .then(setRows)
      .catch((err) => showError(err instanceof Error ? err.message : 'Failed to load attendance'))
      .finally(() => setLoadingRows(false));
  }, [selectedSessionId, showError]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const selectedSession = sessionsForDate.find((s) => s.id === selectedSessionId) ?? null;

  const mark = async (studentId: string, status: ApiAttendanceStatus) => {
    if (!selectedSessionId) return;
    setMarking(true);
    try {
      const updated = await apiMarkAttendance(selectedSessionId, studentId, { status });
      setRows((prev) => prev.map((r) => (r.student_id === studentId ? updated : r)));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to mark attendance');
    } finally {
      setMarking(false);
    }
  };

  const markAll = async (status: ApiAttendanceStatus) => {
    if (!selectedSessionId || rows.length === 0) return;
    setMarking(true);
    try {
      await apiBulkMarkAttendance(
        selectedSessionId,
        rows.map((r) => ({ studentId: r.student_id, status }))
      );
      showSuccess(`Marked everyone ${status}`);
      loadRows();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to bulk-mark attendance');
    } finally {
      setMarking(false);
    }
  };

  const openHistory = (row: ApiSessionAttendance) => {
    setHistoryFor(row);
    setLoadingHistory(true);
    apiGetAttendanceHistory(row.session_id, row.student_id)
      .then(setHistory)
      .catch((err) => showError(err instanceof Error ? err.message : 'Failed to load attendance history'))
      .finally(() => setLoadingHistory(false));
  };

  // DataTable's default search stringifies whatever field searchKeys points
  // at — flattened here so it reads the student's name instead of "[object
  // Object]" off the nested `student` relation.
  const tableRows = useMemo(() => rows.map((r) => ({ ...r, studentName: r.student.full_name })), [rows]);

  const total = rows.length;
  const presentCount = rows.filter((r) => r.status === 'present').length;
  const absentCount = rows.filter((r) => r.status === 'absent').length;
  const rate = total ? Math.round((presentCount / total) * 100) : 0;

  return (
    <div className="space-y-4 flex-1 min-h-0 flex flex-col">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider block">In This Session</span>
            <span className="text-2xl font-bold text-white mt-1 block">{total}</span>
          </div>
          <div className="p-3 bg-zinc-750 rounded-lg">
            <Users size={20} className="text-gold" />
          </div>
        </div>
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider block">Present</span>
            <span className="text-2xl font-bold text-green-400 mt-1 block">{presentCount}</span>
          </div>
          <div className="p-3 bg-green-500/10 rounded-lg">
            <CheckCircle size={20} className="text-green-400" />
          </div>
        </div>
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider block">Absent</span>
            <span className="text-2xl font-bold text-red-400 mt-1 block">{absentCount}</span>
          </div>
          <div className="p-3 bg-red-500/10 rounded-lg">
            <XCircle size={20} className="text-red-400" />
          </div>
        </div>
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider block">Attendance Rate</span>
            <span className="text-2xl font-bold text-gold mt-1 block">{rate}%</span>
          </div>
          <div className="p-3 bg-gold/10 rounded-lg">
            <Clock size={20} className="text-gold" />
          </div>
        </div>
      </div>

      <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5 space-y-4 flex-1 min-h-0 flex flex-col [&>*]:shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-zinc-750">
          <div>
            <h2 className="text-lg font-bold text-white">Session Attendance</h2>
            <p className="text-xs text-gray-400 mt-0.5">Pick a date, then a session on that date.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-zinc-900 border border-zinc-750 rounded-lg pl-3 pr-3 py-2 text-white text-sm focus:outline-none focus:border-gold w-40"
            />
            <Select
              value={selectedSessionId}
              onChange={setSelectedSessionId}
              options={sessionsForDate.map((s) => ({ value: s.id, label: sessionLabel(s) }))}
              placeholder={sessionsForDate.length === 0 ? 'No sessions this day' : 'Select session'}
              disabled={sessionsForDate.length === 0}
              className="w-64"
            />
            {selectedSession && (
              <div className="flex gap-2">
                <button
                  onClick={() => markAll('present')}
                  disabled={marking || rows.length === 0}
                  className="px-3.5 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Check size={14} />
                  Mark All Present
                </button>
                <button
                  onClick={() => markAll('absent')}
                  disabled={marking || rows.length === 0}
                  className="px-3.5 py-2 bg-zinc-750 hover:bg-zinc-700 text-white text-xs font-semibold rounded-lg border border-zinc-650 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <X size={14} />
                  Mark All Absent
                </button>
              </div>
            )}
          </div>
        </div>

        {loadingSessions || loadingRows ? (
          <div className="min-h-[30vh] flex items-center justify-center">
            <SpinnerSquare size={40} />
          </div>
        ) : !selectedSession ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">No session selected for this date.</div>
        ) : (
          <DataTable
            columns={[
              { key: 'studentName', header: 'Student', render: (row) => <span className="font-semibold text-white">{row.studentName}</span> },
              {
                key: 'hours_credited',
                header: 'Hours',
                render: (row) => (row.hours_credited ? `${row.hours_credited}h` : '—'),
              },
              { key: 'notes', header: 'Notes', render: (row) => row.notes || '—' },
            ]}
            data={tableRows}
            searchPlaceholder="Search student..."
            searchKeys={['studentName']}
            hideExport
            actions={(row) => (
              <div className="inline-flex rounded-lg p-0.5 bg-zinc-950 border border-zinc-850 gap-0.5">
                <button
                  onClick={() => mark(row.student_id, 'present')}
                  disabled={marking}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${STATUS_STYLES[row.status === 'present' ? 'present' : 'not_marked']}`}
                >
                  <Check size={12} />
                  Present
                </button>
                <button
                  onClick={() => mark(row.student_id, 'absent')}
                  disabled={marking}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${STATUS_STYLES[row.status === 'absent' ? 'absent' : 'not_marked']}`}
                >
                  <X size={12} />
                  Absent
                </button>
                <button
                  onClick={() => mark(row.student_id, 'excused')}
                  disabled={marking}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${STATUS_STYLES[row.status === 'excused' ? 'excused' : 'not_marked']}`}
                >
                  <MinusCircle size={12} />
                  Excused
                </button>
                <button
                  onClick={() => openHistory(row)}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-md transition-all text-gray-400 hover:text-white hover:bg-zinc-850"
                  title="View status history"
                >
                  <History size={12} />
                </button>
              </div>
            )}
          />
        )}
      </div>

      <Modal open={!!historyFor} onClose={() => setHistoryFor(null)} title={historyFor ? `${historyFor.student.full_name}'s Attendance History` : 'History'}>
        {loadingHistory ? (
          <div className="py-8 flex justify-center">
            <SpinnerSquare size={32} />
          </div>
        ) : history.length === 0 ? (
          <p className="text-gray-500 text-sm">No changes recorded yet — still at the status it was seeded with.</p>
        ) : (
          <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-xs">
                <span>
                  <span className={STATUS_TEXT_STYLES[h.from_status]}>{h.from_status}</span>
                  {' → '}
                  <span className={`font-semibold ${STATUS_TEXT_STYLES[h.to_status]}`}>{h.to_status}</span>
                </span>
                <span className="text-gray-500">{new Date(h.changed_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
