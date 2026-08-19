import { useState, useEffect, useMemo, useCallback } from 'react';
import { Users, CheckSquare, FolderOpen, CalendarClock, ClipboardList, TrendingUp } from 'lucide-react';
import StatCard from '../../components/StatCard';
import Select from '../../components/Select';
import SpinnerSquare from '../../components/SpinnerSquare';
import type { ApiStudent, Team, PrdSubmission, PrdStatus } from '../../lib/types';
import { apiListMyTeams, apiListStudents, apiGetAllPrdSubmissions, apiGetMySessions } from '../../lib/api';
import { apiListTasks } from '../../lib/api/tasks';
import type { ApiTask } from '../../lib/api/tasks';

import { usePageRefresh } from '../../context/RefreshContext';

interface Props {
  mentorId: string;
  onNavigateToSection: (tab: string) => void;
}

interface MentorStudent {
  id: string;
  name: string;
  rollNumber: string;
  batch: string | null;
  track: string;
}

// Draft submissions aren't a mentor's concern yet (still being edited by the
// student) — only these three are meaningful review-status buckets.
const SUBMISSION_STATUS_BUCKETS: { label: string; statuses: PrdStatus[]; barClass: string }[] = [
  { label: 'Pending Review', statuses: ['submitted', 'under_review'], barClass: 'bg-yellow-500' },
  { label: 'Approved', statuses: ['approved'], barClass: 'bg-green-500' },
  { label: 'Changes Requested', statuses: ['changes_requested'], barClass: 'bg-red-500' },
];

export default function MentorDashboard({
  onNavigateToSection,
}: Partial<Props> & Pick<Props, 'mentorId' | 'onNavigateToSection'>) {
  // mentorId is no longer needed here — GET /tasks and the submissions list
  // both scope to the authenticated caller server-side, not a passed id.
  // Attendance has no real backend endpoint anywhere in this app yet — still
  // the localStorage/DataContext mock until that module exists for real.

  // Real roster: teams this mentor is actually allocated to (primary or
  // secondary), joined against the student profile list for batch/roll
  // number. Track comes from the team, not the student — the backend has no
  // per-student track field, only a per-team one.
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [apiStudents, setApiStudents] = useState<ApiStudent[]>([]);
  // GET /tasks already scopes to "assigned to me or created by me" for a
  // mentor caller server-side — no client-side filtering needed.
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  // apiGetAllPrdSubmissions has no mentor-scoping param (matches the same
  // fetch-all-then-filter-by-mentee pattern mentor/Submissions.tsx already
  // uses) — filtered below via studentIds once the roster is known.
  const [submissions, setSubmissions] = useState<PrdSubmission[]>([]);
  // Real session counts, replacing a card that counted localStorage mock rows
  // and another that was the literal string "72%".
  const [upcomingSessions, setUpcomingSessions] = useState(0);
  const [sessionsHeld, setSessionsHeld] = useState(0);
  const [loadingRoster, setLoadingRoster] = useState(true);

  const loadDashboardData = useCallback(() => {
    return Promise.all([apiListMyTeams(), apiListStudents(), apiListTasks(), apiGetAllPrdSubmissions()])
      .then(([teams, students, taskRes, submissionRes]) => {
        setMyTeams(teams);
        setApiStudents(students);
        setTasks(taskRes.data);
        setSubmissions(submissionRes);
      })
      .catch((err) => console.error('Mentor dashboard failed to load', err))
      .finally(() => setLoadingRoster(false));
  }, []);

  useEffect(() => {
    loadDashboardData();
    // from/to are date-only (YYYY-MM-DD) — they filter scheduled_date, not the
    // start instant, so passing a full ISO string here would be comparing a
    // timestamp against a date column.
    const dateKey = (d: Date) => d.toISOString().slice(0, 10);
    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60_000);
    // Counted server-side — limit 1, and the pagination total is what's read,
    // rather than pulling every session down to measure the array's length.
    apiGetMySessions({ from: dateKey(now), to: dateKey(weekAhead), status: 'scheduled', page: 1, limit: 1 })
      .then((res) => setUpcomingSessions(res.pagination.total))
      .catch(() => setUpcomingSessions(0));
    // Completed sessions are past by definition, so no date bound is needed.
    apiGetMySessions({ status: 'completed', page: 1, limit: 1 })
      .then((res) => setSessionsHeld(res.pagination.total))
      .catch(() => setSessionsHeld(0));
  }, [loadDashboardData]);

  usePageRefresh(loadDashboardData);

  const myStudents = useMemo<MentorStudent[]>(() => {
    const profileById = new Map(apiStudents.map(s => [s.id, s]));
    return myTeams.flatMap(team =>
      team.members
        .map((m): MentorStudent | null => {
          const profile = profileById.get(m.studentId);
          if (!profile) return null;
          return {
            id: m.studentId,
            name: profile.fullName ?? m.fullName ?? '-',
            rollNumber: profile.rollNumber ?? '-',
            batch: profile.batch ?? null,
            track: team.track,
          };
        })
        .filter((s): s is MentorStudent => s !== null)
    );
  }, [myTeams, apiStudents]);

  const [batchFilter, setBatchFilter] = useState('');
  const [trackFilter, setTrackFilter] = useState('');

  const distinctBatches = useMemo(() => {
    const vals = myStudents.map(s => s.batch).filter((b): b is string => !!b);
    return Array.from(new Set(vals)).sort();
  }, [myStudents]);

  const distinctTracks = useMemo(() => {
    return Array.from(new Set(myStudents.map(s => s.track).filter(Boolean)));
  }, [myStudents]);

  const filteredStudents = useMemo(() => {
    return myStudents.filter(s => {
      if (batchFilter && s.batch !== batchFilter) return false;
      if (trackFilter && s.track !== trackFilter) return false;
      return true;
    });
  }, [myStudents, batchFilter, trackFilter]);

  const studentIds = new Set(filteredStudents.map(s => s.id));

  const mySubmissions = submissions.filter(s => s.studentId && studentIds.has(s.studentId));
  const pendingSubmissions = mySubmissions.filter(s => s.status === 'submitted' || s.status === 'under_review').length;

  if (loadingRoster) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <SpinnerSquare size={48} />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Mentor Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Overview of your assigned students and tasks</p>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3">
        <Select
          variant="filter"
          className="min-w-[160px]"
          value={batchFilter}
          onChange={setBatchFilter}
          placeholder="All Batches"
          options={distinctBatches.map(b => ({ value: b, label: b }))}
        />
        <Select
          variant="filter"
          className="min-w-[160px]"
          value={trackFilter}
          onChange={setTrackFilter}
          placeholder="All Tracks"
          options={distinctTracks.map(t => ({ value: t, label: t }))}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6">
        <StatCard title="My Teams" value={myTeams.length} icon={Users} onClick={() => onNavigateToSection('ojts')} />
        <StatCard title="My Tasks" value={tasks.length} icon={CheckSquare} onClick={() => onNavigateToSection('tasks')} />
        <StatCard title="Pending Reviews" value={pendingSubmissions} icon={FolderOpen} trend="Needs review" onClick={() => onNavigateToSection('submissions')} />
        <StatCard title="Sessions This Week" value={upcomingSessions} icon={CalendarClock} onClick={() => onNavigateToSection('sessions')} />
        <StatCard title="Sessions Held" value={sessionsHeld} icon={ClipboardList} onClick={() => onNavigateToSection('attendance')} />
      </div>

      <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Submission Status</h3>
          <TrendingUp size={18} className="text-gold" />
        </div>
        <div className="space-y-3">
          {SUBMISSION_STATUS_BUCKETS.map(({ label, statuses, barClass }) => {
            const count = mySubmissions.filter(s => statuses.includes(s.status)).length;
            const pct = mySubmissions.length ? Math.round((count / mySubmissions.length) * 100) : 0;
            return (
              <div key={label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-300">{label}</span>
                  <span className="text-gray-400">{count} ({pct}%)</span>
                </div>
                <div className="h-2 bg-zinc-750 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barClass}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
