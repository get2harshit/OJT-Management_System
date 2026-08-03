import { useState, useEffect, useMemo, useCallback } from 'react';
import { CheckSquare, FolderOpen, Cloud, CalendarCheck, TrendingUp, Clock, Briefcase, UserCheck, AlertCircle, ArrowUpRight } from 'lucide-react';
import StatCard from '../../components/StatCard';
import SpinnerSquare from '../../components/SpinnerSquare';
import type { Credit, Attendance, PrdSubmission, PrdStatus, MyTeamStatus } from '../../lib/types';
import { apiGetMySubmissions, apiGetMyCohort, apiGetMyTeamStatus } from '../../lib/api';
import { apiListTasks } from '../../lib/api/tasks';
import type { ApiTask } from '../../lib/api/tasks';
import { useAuth } from '../../context/useAuth';
import { useCredits } from '../../hooks/useCredits';
import { useAttendance } from '../../hooks/useAttendance';
import { usePageRefresh } from '../../context/RefreshContext';

interface Props {
  studentId: string;
  credits: Credit[];
  attendance: Attendance[];
  onNavigateToTab: (tab: string) => void;
}

const SUBMISSION_STATUS_BUCKETS: { label: string; statuses: PrdStatus[]; barClass: string }[] = [
  { label: 'Pending Review', statuses: ['submitted', 'under_review'], barClass: 'bg-gold' },
  { label: 'Approved', statuses: ['approved'], barClass: 'bg-green-500' },
  { label: 'Changes Requested', statuses: ['changes_requested'], barClass: 'bg-red-500' },
];

export default function StudentDashboard({
  studentId,
  credits: propCredits,
  attendance: propAttendance,
  onNavigateToTab,
}: Partial<Props> & Pick<Props, 'studentId' | 'onNavigateToTab'>) {
  const { user } = useAuth();
  const { credits: hookCredits } = useCredits();
  const { attendance: hookAttendance } = useAttendance();
  const credits = propCredits ?? hookCredits ?? [];
  const attendance = propAttendance ?? hookAttendance ?? [];

  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [submissions, setSubmissions] = useState<PrdSubmission[]>([]);
  const [teamStatus, setTeamStatus] = useState<MyTeamStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboardData = useCallback(() => {
    return Promise.all([
      apiListTasks(),
      apiGetMySubmissions(),
      apiGetMyCohort()
        .then((c) => apiGetMyTeamStatus(c.cohortId))
        .catch(() => null),
    ])
      .then(([taskRes, mySubs, statusRes]) => {
        setTasks(taskRes.data);
        setSubmissions(mySubs.submissions);
        setTeamStatus(statusRes);
      })
      .catch((err) => console.error('Student dashboard failed to load', err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  usePageRefresh(loadDashboardData);

  const myCredits = useMemo(() => credits.filter((c) => c.student_id === studentId), [credits, studentId]);
  const myAttendance = useMemo(() => attendance.filter((a) => a.student_id === studentId), [attendance, studentId]);

  const pendingTasks = tasks.filter((t) => {
    const status = t.myAssignment?.status;
    return status === 'pending' || status === 'resubmit';
  });

  const approvedTaskCount = tasks.filter((t) => t.myAssignment?.status === 'approved').length;
  const pendingReviewCount = submissions.filter((s) => s.status === 'submitted' || s.status === 'under_review').length;
  const totalCredits = myCredits.reduce((sum, c) => sum + Number(c.amount), 0);
  const attendanceDays = myAttendance.length;

  const progressPct = tasks.length > 0 ? Math.round((approvedTaskCount / tasks.length) * 100) : 0;

  const userName = user?.fullName || (user?.email ? user.email.split('@')[0] : 'Student');

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <SpinnerSquare size={48} />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Personalized Greeting Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 bg-zinc-850 border border-zinc-750 p-6 rounded-2xl shadow-sm">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Welcome back, <span className="text-gold">{userName}</span> 👋
          </h1>
          <p className="text-gray-400 text-sm mt-1">Here is a summary of your active OJT project, tasks, and progress.</p>
        </div>
        <button
          onClick={() => onNavigateToTab('projects')}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-bold text-xs rounded-xl hover:bg-gold-hover transition-colors shadow-sm"
        >
          <Briefcase size={16} />
          View Project Details
        </button>
      </div>

      {/* Active OJT Project Status Card */}
      <div className="bg-zinc-850 border border-zinc-750 rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-750 pb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gold/10 text-gold border border-gold/20 shrink-0">
              <Briefcase size={22} />
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Active OJT Project</p>
              <h2 className="text-lg font-bold text-white">
                {teamStatus?.projectPreferences?.allocatedProjectId
                  ? 'Allocated Project'
                  : teamStatus?.team
                  ? 'Project Selection In Progress'
                  : 'No Team Joined Yet'}
              </h2>
            </div>
          </div>
          {teamStatus?.team && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gold/15 text-gold border border-gold/30">
              Track: {teamStatus.team.track || 'Unassigned'}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <div className="bg-zinc-800/60 p-4 rounded-xl border border-zinc-750">
            <p className="text-xs text-gray-400 font-medium">Team Status</p>
            <p className="text-white font-bold text-sm mt-1">
              {teamStatus?.team ? (teamStatus.team.name || 'Team Formed') : 'Not Formed'}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {teamStatus?.team ? `${teamStatus.team.members.length} members` : 'Join or create a team'}
            </p>
          </div>

          <div className="bg-zinc-800/60 p-4 rounded-xl border border-zinc-750">
            <p className="text-xs text-gray-400 font-medium">Assigned Mentor</p>
            <p className="text-white font-bold text-sm mt-1 flex items-center gap-1.5">
              <UserCheck size={16} className="text-gold shrink-0" />
              {teamStatus?.projectPreferences?.allocatedMentorName || 'Pending Allocation'}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">Guidance & Reviews</p>
          </div>

          <div className="bg-zinc-800/60 p-4 rounded-xl border border-zinc-750">
            <p className="text-xs text-gray-400 font-medium">Overall Completion</p>
            <p className="text-gold font-bold text-sm mt-1">{progressPct}% Tasks Approved</p>
            <div className="h-1.5 bg-zinc-700 rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-gold rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard title="Pending Tasks" value={pendingTasks.length} icon={Clock} trend="To do" onClick={() => onNavigateToTab('tasks')} />
        <StatCard title="Submissions" value={submissions.length} icon={FolderOpen} onClick={() => onNavigateToTab('submissions')} />
        <StatCard title="Pending Review" value={pendingReviewCount} icon={CheckSquare} trend="Awaiting" onClick={() => onNavigateToTab('submissions')} />
        <StatCard title="Cloud Credits" value={`$${totalCredits}`} icon={Cloud} onClick={() => onNavigateToTab('credits')} />
        <StatCard title="Attendance Days" value={attendanceDays} icon={CalendarCheck} onClick={() => onNavigateToTab('attendance')} />
        <StatCard title="Progress" value={`${progressPct}%`} icon={TrendingUp} trend="Keep going" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Upcoming Tasks Countdown Card */}
        <div className="bg-zinc-850 border border-zinc-750 rounded-2xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Clock size={18} className="text-gold" />
                Upcoming Task Deadlines
              </h3>
              <button
                onClick={() => onNavigateToTab('tasks')}
                className="text-xs font-semibold text-gold hover:underline flex items-center gap-1"
              >
                View all <ArrowUpRight size={14} />
              </button>
            </div>

            {pendingTasks.length === 0 ? (
              <div className="py-8 text-center text-gray-500 space-y-2">
                <AlertCircle size={32} className="mx-auto text-zinc-600" />
                <p className="text-sm font-medium text-gray-300">All tasks caught up!</p>
                <p className="text-xs text-gray-500">You have no pending task deadlines right now.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-60 overflow-y-auto scrollbar-thin pr-1">
                {pendingTasks.slice(0, 4).map((t) => {
                  const deadline = t.deadline ? new Date(t.deadline) : null;
                  const isPast = deadline ? deadline < new Date() : false;
                  return (
                    <div
                      key={t.id}
                      onClick={() => onNavigateToTab('tasks')}
                      className="p-3 bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-750 rounded-xl cursor-pointer transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white truncate">{t.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{t.description || 'No description'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {isPast ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                            Overdue
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-gold/15 text-gold border border-gold/30">
                            Due {deadline ? deadline.toLocaleDateString() : 'Soon'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Submission Status Breakdown Card */}
        <div className="bg-zinc-850 border border-zinc-750 rounded-2xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <TrendingUp size={18} className="text-gold" />
                Submission Status Breakdown
              </h3>
            </div>
            <div className="space-y-4">
              {SUBMISSION_STATUS_BUCKETS.map(({ label, statuses, barClass }) => {
                const count = submissions.filter((s) => statuses.includes(s.status)).length;
                const total = submissions.length || 1;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={label} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-gray-300">{label}</span>
                      <span className="text-gray-400">{count} ({pct}%)</span>
                    </div>
                    <div className="h-2.5 bg-zinc-750 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${barClass}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
