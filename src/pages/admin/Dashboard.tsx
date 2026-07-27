import { useState, useMemo, useEffect } from 'react';
import { Users, CheckSquare, FolderOpen, Cloud, CalendarCheck, TrendingUp, UserCog, Briefcase, Download } from 'lucide-react';
import { exportToCSV } from '../../lib/csvExport';
import StatCard from '../../components/StatCard';
import Select from '../../components/Select';
import SpinnerSquare from '../../components/SpinnerSquare';
import type { Task, Submission, Attendance, DashboardMetrics, Cohort } from '../../lib/types';
import {
  apiGetDashboardMetrics,
  apiListCohorts,
} from '../../lib/api';
import { getCohortLabel } from '../../lib/cohortLabel';
import { TRACKS } from '../../lib/constants';

import { useTasks } from '../../hooks/useTasks';
import { useSubmissions } from '../../hooks/useSubmissions';
import { useAttendance } from '../../hooks/useAttendance';

interface Props {
  tasks: Task[];
  submissions: Submission[];
  attendance: Attendance[];
  onNavigateToTab: (tab: string) => void;
}

export default function AdminDashboard({
  tasks: propTasks,
  submissions: propSubmissions,
  attendance: propAttendance,
  onNavigateToTab,
}: Partial<Props> & Pick<Props, 'onNavigateToTab'>) {
  const { tasks: hookTasks } = useTasks();
  const { submissions: hookSubmissions } = useSubmissions();
  const { attendance: hookAttendance } = useAttendance();

  const tasks = propTasks ?? hookTasks;
  const submissions = propSubmissions ?? hookSubmissions;
  const attendance = propAttendance ?? hookAttendance;
  const [semFilter, setSemFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [trackFilter, setTrackFilter] = useState('');

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loadingReal, setLoadingReal] = useState(true);

  // Real backend counts (students/mentors/batch managers/projects/credits) —
  // everything else on this page (submission breakdown, activity feed) is
  // mock data (see DataContext's defaultSubmissions/defaultAttendance —
  // never wired to a real backend endpoint), not derived from any roster.
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);

  useEffect(() => {
    apiListCohorts()
      .then(setCohorts)
      .catch((err) => console.error('Dashboard failed to load cohorts', err))
      .finally(() => setLoadingReal(false));
  }, []);

  // Stat-card counts — server-filtered by the current cohort/batch/track
  // selection, so no full roster needs to be downloaded just to show a number.
  useEffect(() => {
    apiGetDashboardMetrics({ cohortId: semFilter || undefined, batch: batchFilter || undefined, track: trackFilter || undefined })
      .then(setMetrics)
      .catch((err) => console.error('Dashboard failed to load metrics', err));
  }, [semFilter, batchFilter, trackFilter]);

  const semesterOptions = useMemo(() => {
    return cohorts.map(c => ({ value: c.id, label: getCohortLabel(c) }));
  }, [cohorts]);

  const batchOptions = useMemo(() => {
    if (semFilter) {
      const cohort = cohorts.find(c => c.id === semFilter);
      return (cohort?.allowedBatches || []).map(b => ({ value: b, label: b }));
    }
    const all = cohorts.flatMap(c => c.allowedBatches || []);
    return Array.from(new Set(all)).sort().map(b => ({ value: b, label: b }));
  }, [semFilter, cohorts]);

  const taskCount = tasks.length;
  // submissions/attendance are mock/localStorage data with no real student
  // linkage worth scoping (see the state-declaration comment above) — shown
  // as-is rather than filtered by a roster fetched just for this.
  const pendingSubmissions = submissions.filter(s => s.status === 'PENDING').length;
  const attendanceCount = attendance.length;

  // Stat-card counts — always straight from /dashboard/metrics, which is
  // re-fetched with the current cohort/batch/track filters above. No client
  // list is downloaded just to compute one of these.
  const showStudentsCount = metrics ? metrics.studentsCount : '—';
  const showMentorsCount = metrics ? metrics.mentorsCount : '—';
  const showBatchManagersCount = metrics ? metrics.batchManagersCount : '—';
  const showProjectsCount = metrics ? metrics.projectsCount : '—';

  if (loadingReal) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <SpinnerSquare size={48} />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">Overview of the OJT management system</p>
        </div>
        <button
          onClick={() => {
            exportToCSV('admin_dashboard_metrics', [
              {
                studentsCount: showStudentsCount,
                mentorsCount: showMentorsCount,
                projectsCount: showProjectsCount,
                creditsAvailable: metrics?.totalCreditsAvailable ?? 0,
                activeFilterCohort: semFilter ? (cohorts.find(c => c.id === semFilter)?.name || semFilter) : 'All Cohorts',
              }
            ]);
          }}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-gold text-black rounded-lg hover:bg-gold-hover transition-colors shadow-sm"
        >
          <Download size={15} />
          Export Dashboard CSV
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3">
        <Select
          variant="filter"
          className="min-w-[160px]"
          value={semFilter}
          onChange={v => { setSemFilter(v); setBatchFilter(''); }}
          placeholder="All Cohorts"
          options={semesterOptions}
        />
        <Select
          variant="filter"
          className="min-w-[160px]"
          value={batchFilter}
          onChange={setBatchFilter}
          placeholder="All Batches"
          options={batchOptions}
        />
        <Select
          variant="filter"
          className="min-w-[160px]"
          value={trackFilter}
          onChange={setTrackFilter}
          placeholder="All Tracks"
          options={TRACKS.map(t => ({ value: t, label: t }))}
        />
      </div>

      {/* Stat Cards — Students/Mentors/Batch Managers/Projects/Credits are real
          backend counts; Tasks/Pending Submissions/Attendance stay mock since
          the metrics endpoint has no data for them. Each card jumps to its
          matching sidebar tab, except Batch Managers which has no page yet. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatCard title="Students" value={showStudentsCount} icon={Users} onClick={() => onNavigateToTab('students')} />
        <StatCard title="Mentors" value={showMentorsCount} icon={Users} onClick={() => onNavigateToTab('mentors')} />
        <StatCard title="Batch Managers" value={showBatchManagersCount} icon={UserCog} />
        <StatCard title="Projects" value={showProjectsCount} icon={Briefcase} onClick={() => onNavigateToTab('ojts')} />
        <StatCard title="Cloud Credits" value={metrics ? `$${metrics.totalCreditsAvailable}` : '—'} icon={Cloud} onClick={() => onNavigateToTab('credits')} />
        <StatCard title="Tasks" value={taskCount} icon={CheckSquare} onClick={() => onNavigateToTab('tasks')} />
        <StatCard title="Pending Submissions" value={pendingSubmissions} icon={FolderOpen} trend="Needs review" onClick={() => onNavigateToTab('submissions')} />
        <StatCard title="Attendance Records" value={attendanceCount} icon={CalendarCheck} onClick={() => onNavigateToTab('attendance')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Submission Status</h3>
            <TrendingUp size={18} className="text-gold" />
          </div>
          <div className="space-y-3">
            {(['PENDING', 'ACCEPTED', 'RETURNED'] as const).map((status) => {
              const count = submissions.filter(s => s.status === status).length;
              const pct = submissions.length ? Math.round((count / submissions.length) * 100) : 0;
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
            <h3 className="text-lg font-semibold text-white">Recent Activity</h3>
          </div>
          <div className="space-y-3">
            {submissions.slice(-5).reverse().map(sub => (
              <div key={sub.id} className="flex items-center gap-3 text-sm">
                <div className={`w-2 h-2 rounded-full ${sub.status === 'PENDING' ? 'bg-yellow-500' : sub.status === 'ACCEPTED' ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                <span className="text-gray-300 flex-1">{sub.file_name}</span>
                <span className="text-gray-500 text-xs">{sub.submitted_at}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
