import { useState, useMemo, useEffect } from 'react';
import { Users, CheckSquare, FolderOpen, Cloud, CalendarCheck, TrendingUp, Sparkles, Activity, UserCog, Briefcase } from 'lucide-react';
import StatCard from '../../components/StatCard';
import Select from '../../components/Select';
import SpinnerSquare from '../../components/SpinnerSquare';
import type { Task, Submission, Attendance, DashboardMetrics, ApiMentor, ApiStudent, Cohort, CohortDetails, Project } from '../../lib/types';
import {
  apiGetDashboardMetrics,
  apiListMentors,
  apiListCohorts,
  apiListStudents,
  apiGetCohort,
  apiGetProjectsForCohort,
  apiListProjects
} from '../../lib/api';
import { getCohortLabel } from '../../lib/cohortLabel';
import { TRACKS, TRACK_DOT_COLORS } from '../../lib/constants';
import { mapFrontendTrackToBackend, mapBackendTrackToFrontend } from '../../lib/api/trackMapping';

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
  const [apiStudents, setApiStudents] = useState<ApiStudent[]>([]);
  const [apiMentors, setApiMentors] = useState<ApiMentor[]>([]);
  const [globalProjects, setGlobalProjects] = useState<Project[]>([]);
  const [loadingReal, setLoadingReal] = useState(true);

  // Cohort details & projects (when semFilter/cohort is selected)
  const [selectedCohortDetails, setSelectedCohortDetails] = useState<CohortDetails | null>(null);
  const [cohortProjects, setCohortProjects] = useState<Project[]>([]);

  // Real backend counts (students/mentors/batch managers/projects/credits) —
  // everything else on this page (progress tracker, mentor table, submission
  // breakdown, activity feed) has no backend equivalent yet and stays mock.
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);

  useEffect(() => {
    Promise.all([
      apiGetDashboardMetrics(),
      apiListCohorts(),
      apiListStudents(),
      apiListMentors(),
      apiListProjects()
    ])
      .then(([metricsRes, cohortsRes, studentsRes, mentorsRes, projectsRes]) => {
        setMetrics(metricsRes);
        setCohorts(cohortsRes);
        setApiStudents(studentsRes);
        setApiMentors(mentorsRes);
        setGlobalProjects(projectsRes);
      })
      .catch((err) => console.error('Dashboard failed to load real data', err))
      .finally(() => setLoadingReal(false));
  }, []);

  useEffect(() => {
    if (semFilter) {
      Promise.all([
        apiGetCohort(semFilter),
        apiGetProjectsForCohort(semFilter)
      ])
        .then(([cohortDetails, cohortProj]) => {
          setSelectedCohortDetails(cohortDetails);
          setCohortProjects(cohortProj);
        })
        .catch((err) => console.error('Dashboard failed to load cohort details', err));
    } else {
      setSelectedCohortDetails(null);
      setCohortProjects([]);
    }
  }, [semFilter]);

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

  // Scoped student list
  const cohortScopedStudents = useMemo(() => {
    if (semFilter && selectedCohortDetails) {
      return selectedCohortDetails.students || [];
    }
    return apiStudents;
  }, [semFilter, selectedCohortDetails, apiStudents]);

  const filteredStudents = useMemo(() => {
    return cohortScopedStudents.filter(s => {
      if (batchFilter && s.batch !== batchFilter) return false;
      if (trackFilter) {
        const studentTrack = s.track;
        if (!studentTrack || studentTrack.toLowerCase() !== trackFilter.toLowerCase()) return false;
      }
      return true;
    });
  }, [cohortScopedStudents, batchFilter, trackFilter]);

  const studentIds = new Set(filteredStudents.map(s => s.id));

  // Scoped mentor list
  const cohortScopedMentors = useMemo(() => {
    if (semFilter && selectedCohortDetails) {
      return selectedCohortDetails.mentors || [];
    }
    return apiMentors;
  }, [semFilter, selectedCohortDetails, apiMentors]);

  const filteredMentors = useMemo(() => {
    return cohortScopedMentors.filter(m => {
      if (trackFilter) {
        const backendTrack = mapFrontendTrackToBackend(trackFilter);
        return m.tracks?.includes(backendTrack) || m.tracks?.includes(trackFilter);
      }
      return true;
    });
  }, [cohortScopedMentors, trackFilter]);

  // Scoped projects list
  const cohortScopedProjects = useMemo(() => {
    if (semFilter) {
      return cohortProjects;
    }
    return globalProjects;
  }, [semFilter, cohortProjects, globalProjects]);

  const filteredProjects = useMemo(() => {
    return cohortScopedProjects.filter(p => {
      if (trackFilter && p.track !== trackFilter) return false;
      return true;
    });
  }, [cohortScopedProjects, trackFilter]);

  // Shape ApiMentor to the fields used in mentorTrackerList below
  const mentors = filteredMentors.map(m => ({
    id: m.id,
    name: m.fullName || m.email || 'Unnamed Mentor',
    track: m.isExternal ? 'External' : 'Internal',
    tracks: (m.tracks && m.tracks.length > 0) ? m.tracks.map(mapBackendTrackToFrontend) : [m.isExternal ? 'External' : 'Internal'],
  }));

  const taskCount = tasks.length;
  const filteredSubmissions = submissions.filter(s => studentIds.has(s.student_id));
  const pendingSubmissions = filteredSubmissions.filter(s => s.status === 'PENDING').length;
  const filteredAttendance = attendance.filter(a => studentIds.has(a.student_id));
  const attendanceCount = filteredAttendance.length;

  // Progress status counts
  const onTrackCount = useMemo(() => filteredStudents.filter(s => s.progressStatus === 'ON_TRACK' || s.progress_status === 'ON_TRACK').length, [filteredStudents]);
  const delayingCount = useMemo(() => filteredStudents.filter(s => s.progressStatus === 'DELAYING' || s.progress_status === 'DELAYING').length, [filteredStudents]);
  const inProcessCount = useMemo(() => filteredStudents.filter(s => {
    const status = s.progressStatus || s.progress_status;
    return status === 'IN_PROCESS' || !status;
  }).length, [filteredStudents]);

  const totalUniqueDates = useMemo(() => {
    return new Set(attendance.map((a) => a.date)).size || 5;
  }, [attendance]);

  // Mentor table data calculation
  const mentorTrackerList = useMemo(() => {
    return mentors.map(m => {
      const assigned = filteredStudents.filter(s => s.mentorId === m.id || s.mentor_id === m.id);
      const onTrack = assigned.filter(s => s.progressStatus === 'ON_TRACK' || s.progress_status === 'ON_TRACK').length;
      const delaying = assigned.filter(s => s.progressStatus === 'DELAYING' || s.progress_status === 'DELAYING').length;
      const inProcess = assigned.length - onTrack - delaying;

      // Attendance calculation for this mentor's students
      const presents = attendance.filter(a => assigned.some(s => s.id === a.student_id)).length;
      const possiblePresents = assigned.length * totalUniqueDates;
      const rate = possiblePresents > 0 ? Math.round((presents / possiblePresents) * 100) : 0;

      return {
        id: m.id,
        name: m.name,
        track: m.track ?? 'General',
        tracks: m.tracks || (m.track ? [m.track] : []),
        totalStudents: assigned.length,
        onTrack,
        delaying,
        inProcess,
        attendanceRate: `${rate}%`
      };
    });
  }, [mentors, filteredStudents, attendance, totalUniqueDates]);

  // Calculated count states for stats cards
  const showStudentsCount = (semFilter || batchFilter || trackFilter) ? filteredStudents.length : (metrics ? metrics.studentsCount : '—');
  const showMentorsCount = (semFilter || trackFilter) ? filteredMentors.length : (metrics ? metrics.mentorsCount : '—');
  const showBatchManagersCount = semFilter ? (selectedCohortDetails?.batchManagers?.length || 0) : (metrics ? metrics.batchManagersCount : '—');
  const showProjectsCount = (semFilter || trackFilter) ? filteredProjects.length : (metrics ? metrics.projectsCount : '—');

  if (loadingReal) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <SpinnerSquare size={48} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">Overview of the OJT management system</p>
        </div>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Students" value={showStudentsCount} icon={Users} onClick={() => onNavigateToTab('students')} />
        <StatCard title="Mentors" value={showMentorsCount} icon={Users} onClick={() => onNavigateToTab('mentors')} />
        <StatCard title="Batch Managers" value={showBatchManagersCount} icon={UserCog} />
        <StatCard title="Projects" value={showProjectsCount} icon={Briefcase} onClick={() => onNavigateToTab('ojts')} />
        <StatCard title="Cloud Credits" value={metrics ? `$${metrics.totalCreditsAvailable}` : '—'} icon={Cloud} onClick={() => onNavigateToTab('credits')} />
        <StatCard title="Tasks" value={taskCount} icon={CheckSquare} onClick={() => onNavigateToTab('tasks')} />
        <StatCard title="Pending Submissions" value={pendingSubmissions} icon={FolderOpen} trend="Needs review" onClick={() => onNavigateToTab('submissions')} />
        <StatCard title="Attendance Records" value={attendanceCount} icon={CalendarCheck} onClick={() => onNavigateToTab('attendance')} />
      </div>

      {/* Progress Status Analytics */}
      <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
        <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <Activity size={18} className="text-gold" />
          OJT Student Progress Tracker
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-4 bg-zinc-800/30 rounded-xl border border-zinc-750 flex flex-col items-center">
            <span className="text-xs text-green-400 font-bold uppercase tracking-wider">On Track</span>
            <span className="text-3xl font-extrabold text-white mt-2">{onTrackCount}</span>
            <span className="text-xs text-gray-500 mt-1">Progressing smoothly</span>
          </div>
          <div className="p-4 bg-zinc-800/30 rounded-xl border border-zinc-750 flex flex-col items-center">
            <span className="text-xs text-yellow-500 font-bold uppercase tracking-wider">In Process</span>
            <span className="text-3xl font-extrabold text-white mt-2">{inProcessCount}</span>
            <span className="text-xs text-gray-500 mt-1">Ongoing implementation</span>
          </div>
          <div className="p-4 bg-zinc-800/30 rounded-xl border border-zinc-750 flex flex-col items-center">
            <span className="text-xs text-red-400 font-bold uppercase tracking-wider">Delaying</span>
            <span className="text-3xl font-extrabold text-white mt-2">{delayingCount}</span>
            <span className="text-xs text-gray-500 mt-1">Requiring immediate support</span>
          </div>
        </div>
      </div>

      {/* Grouped by Mentors Tracker */}
      <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Sparkles size={18} className="text-gold" />
            Mentor Progress Tracker (Sorted by Mentor)
          </h3>
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-zinc-750 bg-zinc-750/30 text-gray-400 text-xs font-semibold uppercase tracking-wider">
                <th className="px-4 py-3">Mentor</th>
                <th className="px-4 py-3">Track Specialty</th>
                <th className="px-4 py-3">Total Students</th>
                <th className="px-4 py-3 text-green-400">On Track</th>
                <th className="px-4 py-3 text-yellow-500">In Process</th>
                <th className="px-4 py-3 text-red-400">Delaying</th>
                <th className="px-4 py-3">Attendance Rate</th>
              </tr>
            </thead>
            <tbody>
              {mentorTrackerList.map(m => (
                <tr key={m.id} className="border-b border-zinc-750/50 hover:bg-zinc-750/10 transition-colors">
                  <td className="px-4 py-3 font-semibold text-white">{m.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {m.tracks.map((t: string) => {
                        const style = TRACK_DOT_COLORS[t] ?? { dot: 'bg-gold', text: 'text-gold' };
                        return (
                          <span key={t} className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                            {t}
                          </span>
                        );
                      })}
                      {m.tracks.length === 0 && (
                        <span className="text-gray-500 text-xs">General</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-300 font-mono font-bold">{m.totalStudents}</td>
                  <td className="px-4 py-3 text-green-400 font-mono">{m.onTrack}</td>
                  <td className="px-4 py-3 text-yellow-500 font-mono">{m.inProcess}</td>
                  <td className="px-4 py-3 text-red-400 font-mono">{m.delaying}</td>
                  <td className="px-4 py-3 text-gray-300 font-mono">{m.attendanceRate}</td>
                </tr>
              ))}
              {mentorTrackerList.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No mentors configured</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile: stacked cards instead of a wide scrolling table */}
        <div className="md:hidden divide-y divide-zinc-750/50">
          {mentorTrackerList.map(m => (
            <div key={m.id} className="py-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-white text-sm">{m.name}</p>
                <span className="text-gray-300 font-mono text-xs">{m.attendanceRate} attendance</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {m.tracks.map((t: string) => {
                  const style = TRACK_DOT_COLORS[t] ?? { dot: 'bg-gold', text: 'text-gold' };
                  return (
                    <span key={t} className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                      {t}
                    </span>
                  );
                })}
                {m.tracks.length === 0 && <span className="text-gray-500 text-xs">General</span>}
              </div>
              <div className="flex items-center gap-4 text-xs font-mono">
                <span className="text-gray-400">Total <span className="text-gray-200 font-bold">{m.totalStudents}</span></span>
                <span className="text-green-400">On Track {m.onTrack}</span>
                <span className="text-yellow-500">In Process {m.inProcess}</span>
                <span className="text-red-400">Delaying {m.delaying}</span>
              </div>
            </div>
          ))}
          {mentorTrackerList.length === 0 && (
            <div className="py-8 text-center text-gray-500 text-sm">No mentors configured</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Submission Status</h3>
            <TrendingUp size={18} className="text-gold" />
          </div>
          <div className="space-y-3">
            {(['PENDING', 'ACCEPTED', 'RETURNED'] as const).map((status) => {
              const count = filteredSubmissions.filter(s => s.status === status).length;
              const pct = filteredSubmissions.length ? Math.round((count / filteredSubmissions.length) * 100) : 0;
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
            {filteredSubmissions.slice(-5).reverse().map(sub => (
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
