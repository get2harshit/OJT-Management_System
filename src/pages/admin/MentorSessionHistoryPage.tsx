import { useEffect, useState } from 'react';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import DataTable from '../../components/DataTable';
import PageLayout from '../../components/PageLayout';
import Select from '../../components/Select';
import { apiGetMentorById, apiListSessions, type ApiSession, type ApiSessionStatus } from '../../lib/api';
import { formatExactDuration } from '../../lib/utils';

const FETCH_PAGE_SIZE = 100;

const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'rescheduled', label: 'Rescheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const RECORDING_OPTIONS = [
  { value: 'available', label: 'Available' },
  { value: 'unavailable', label: 'Not available' },
];

function formatDate(date: string): string {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString();
}

function formatTime(time: string): string {
  return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(session: ApiSession): string {
  const minutes = Math.max(0, Math.round((new Date(session.end_time).getTime() - new Date(session.start_time).getTime()) / 60_000));
  return formatExactDuration(minutes);
}

export default function MentorSessionHistoryPage() {
  const { mentorId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [mentorName, setMentorName] = useState('Mentor');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState('');
  const [recordingAvailability, setRecordingAvailability] = useState('');
  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiGetMentorById(mentorId)
      .then((mentor) => {
        if (!cancelled) setMentorName(mentor.fullName ?? mentor.email ?? 'Mentor');
        console.log(mentor,'mentor')
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
    if (recordingAvailability === 'available' && session.live_session_id == null) return false;
    if (recordingAvailability === 'unavailable' && session.live_session_id != null) return false;
    return true;
  });
  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setStatus('');
    setRecordingAvailability('');
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
          value={recordingAvailability}
          onChange={setRecordingAvailability}
          options={RECORDING_OPTIONS}
          placeholder="All recordings"
          variant="filter"
          className="w-48"
        />
        <button
          type="button"
          onClick={clearFilters}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-zinc-750 text-gold border border-zinc-700 rounded-lg hover:bg-zinc-700 transition-colors shrink-0"
        >
          <RotateCcw size={14} />
          Clear filters
        </button>
      </div>

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
              exportValue: (session) => `${formatDate(session.scheduled_date)} · ${session.id}`,
            },
            {
              key: 'startTime',
              header: 'Start time',
              render: (session) => formatTime(session.start_time),
              exportValue: (session) => formatTime(session.start_time),
            },
            {
              key: 'endTime',
              header: 'End time',
              render: (session) => formatTime(session.end_time),
              exportValue: (session) => formatTime(session.end_time),
            },
            {
              key: 'duration',
              header: 'Duration',
              render: formatDuration,
              exportValue: formatDuration,
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
              key: 'recording',
              header: 'Recording',
              render: (session) => (
                <span title="Yes means this session was started in the platform and has a live session report">
                  {session.live_session_id != null ? 'Yes' : 'No'}
                </span>
              ),
              exportValue: (session) => session.live_session_id != null ? 'Yes' : 'No',
            },
          ]}
          key={`${startDate}|${endDate}|${status}|${recordingAvailability}`}
          data={filteredSessions}
          loading={loading}
          exportFilename="mentor_session_history"
        />
      )}
    </PageLayout>
  );
}