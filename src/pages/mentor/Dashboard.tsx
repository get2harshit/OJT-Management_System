import { useState, useEffect, useMemo } from 'react';
import { Users, CheckSquare, FolderOpen, CalendarCheck, TrendingUp } from 'lucide-react';
import StatCard from '../../components/StatCard';
import Select from '../../components/Select';
import SpinnerSquare from '../../components/SpinnerSquare';
import type { Task, Submission, Attendance, ApiStudent, Team } from '../../lib/types';
import { apiListMyTeams, apiListStudents } from '../../lib/api';

import { useTasks } from '../../hooks/useTasks';
import { useSubmissions } from '../../hooks/useSubmissions';
import { useAttendance } from '../../hooks/useAttendance';

interface Props {
  mentorId: string;
  tasks: Task[];
  submissions: Submission[];
  attendance: Attendance[];
  onNavigateToTab: (tab: string) => void;
}

interface MentorStudent {
  id: string;
  name: string;
  rollNumber: string;
  batch: string | null;
  track: string;
}

export default function MentorDashboard({
  mentorId,
  tasks: propTasks,
  submissions: propSubmissions,
  attendance: propAttendance,
  onNavigateToTab,
}: Partial<Props> & Pick<Props, 'mentorId' | 'onNavigateToTab'>) {
  const { tasks: hookTasks } = useTasks();
  const { submissions: hookSubmissions } = useSubmissions();
  const { attendance: hookAttendance } = useAttendance();

  const tasks = propTasks ?? hookTasks ?? [];
  const submissions = propSubmissions ?? hookSubmissions ?? [];
  const attendance = propAttendance ?? hookAttendance ?? [];

  // Real roster: teams this mentor is actually allocated to (primary or
  // secondary), joined against the student profile list for batch/roll
  // number. Track comes from the team, not the student — the backend has no
  // per-student track field, only a per-team one.
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [apiStudents, setApiStudents] = useState<ApiStudent[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(true);

  useEffect(() => {
    Promise.all([apiListMyTeams(), apiListStudents()])
      .then(([teams, students]) => {
        setMyTeams(teams);
        setApiStudents(students);
      })
      .catch((err) => console.error('Mentor dashboard failed to load roster', err))
      .finally(() => setLoadingRoster(false));
  }, []);

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

  const myTasks = tasks.filter(t => t.mentor_id === mentorId || t.assigned_to === null);
  const mySubmissions = submissions.filter(s => studentIds.has(s.student_id));
  const pendingSubmissions = mySubmissions.filter(s => s.status === 'PENDING').length;
  const filteredAttendance = attendance.filter(a => studentIds.has(a.student_id));

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
        <StatCard title="My Teams" value={myTeams.length} icon={Users} onClick={() => onNavigateToTab('ojts')} />
        <StatCard title="My Tasks" value={myTasks.length} icon={CheckSquare} />
        <StatCard title="Pending Reviews" value={pendingSubmissions} icon={FolderOpen} trend="Needs review" />
        <StatCard title="Attendance Records" value={filteredAttendance.length} icon={CalendarCheck} />
        <StatCard title="Avg Progress" value="72%" icon={TrendingUp} trend="+5%" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Submission Status</h3>
            <TrendingUp size={18} className="text-gold" />
          </div>
          <div className="space-y-3">
            {(['PENDING', 'ACCEPTED', 'RETURNED'] as const).map((status) => {
              const count = mySubmissions.filter(s => s.status === status).length;
              const pct = mySubmissions.length ? Math.round((count / mySubmissions.length) * 100) : 0;
              return (
                <div key={status}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-300">{status}</span>
                    <span className="text-gray-400">{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-zinc-750 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${status === 'PENDING' ? 'bg-yellow-500' : status === 'ACCEPTED' ? 'bg-green-500' : 'bg-red-500'
                        }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Upcoming Deadlines</h3>
          </div>
          <div className="space-y-3">
            {myTasks
              .filter(t => t.due_date)
              .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
              .slice(0, 5)
              .map(task => (
                <div key={task.id} className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-gold" />
                  <span className="text-gray-300 flex-1">{task.title}</span>
                  <span className="text-gray-500 text-xs">{task.due_date}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
