import { useState, useEffect, useMemo } from 'react';
import { CheckSquare, FolderOpen, Cloud, CalendarCheck, TrendingUp, Clock } from 'lucide-react';
import StatCard from '../../components/StatCard';
import SpinnerSquare from '../../components/SpinnerSquare';
import type { Credit, Attendance, PrdSubmission, PrdStatus } from '../../lib/types';
import { apiGetMySubmissions } from '../../lib/api';
import { apiListTasks } from '../../lib/api/tasks';
import type { ApiTask } from '../../lib/api/tasks';

import { useCredits } from '../../hooks/useCredits';
import { useAttendance } from '../../hooks/useAttendance';

interface Props {
  studentId: string;
  credits: Credit[];
  attendance: Attendance[];
  onNavigateToTab: (tab: string) => void;
}

// Same three-bucket rollup as the mentor dashboard's Submission Status panel
// — kept identical so "pending review" means the same thing on both sides.
const SUBMISSION_STATUS_BUCKETS: { label: string; statuses: PrdStatus[]; barClass: string }[] = [
  { label: 'Pending Review', statuses: ['submitted', 'under_review'], barClass: 'bg-yellow-500' },
  { label: 'Approved', statuses: ['approved'], barClass: 'bg-green-500' },
  { label: 'Changes Requested', statuses: ['changes_requested'], barClass: 'bg-red-500' },
];

export default function StudentDashboard({
  studentId,
  credits: propCredits,
  attendance: propAttendance,
  onNavigateToTab,
}: Partial<Props> & Pick<Props, 'studentId' | 'onNavigateToTab'>) {
  // Credits and Attendance have no real backend endpoint anywhere in this
  // app yet — still the localStorage/DataContext mock until those modules
  // exist for real (same situation as the mentor dashboard's Attendance card).
  const { credits: hookCredits } = useCredits();
  const { attendance: hookAttendance } = useAttendance();
  const credits = propCredits ?? hookCredits ?? [];
  const attendance = propAttendance ?? hookAttendance ?? [];

  // Tasks and submissions are real, server-scoped-to-me data — GET /tasks
  // and /submissions/my both already resolve "mine" from the auth token, so
  // there's no studentId to pass or client-side filtering to do.
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [submissions, setSubmissions] = useState<PrdSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([apiListTasks(), apiGetMySubmissions()])
      .then(([taskRes, mySubs]) => {
        setTasks(taskRes.data);
        setSubmissions(mySubs.submissions);
      })
      .catch((err) => console.error('Student dashboard failed to load', err))
      .finally(() => setLoading(false));
  }, []);

  const myCredits = useMemo(() => credits.filter((c) => c.student_id === studentId), [credits, studentId]);
  const myAttendance = useMemo(() => attendance.filter((a) => a.student_id === studentId), [attendance, studentId]);

  // A task counts as "to do" while it's pending or kicked back for resubmit —
  // once it's under review or approved there's nothing left for the student
  // to act on right now.
  const pendingTasks = tasks.filter((t) => {
    const status = t.myAssignment?.status;
    return status === 'pending' || status === 'resubmit';
  }).length;

  const approvedTaskCount = tasks.filter((t) => t.myAssignment?.status === 'approved').length;

  const pendingReviewCount = submissions.filter((s) => s.status === 'submitted' || s.status === 'under_review').length;

  const totalCredits = myCredits.reduce((sum, c) => sum + Number(c.amount), 0);
  const attendanceDays = myAttendance.length;

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <SpinnerSquare size={48} />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Student Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Track your OJT progress and tasks</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 sm:gap-6">
        <StatCard title="Pending Tasks" value={pendingTasks} icon={Clock} trend="To do" onClick={() => onNavigateToTab('tasks')} />
        <StatCard title="Submissions" value={submissions.length} icon={FolderOpen} onClick={() => onNavigateToTab('submissions')} />
        <StatCard title="Pending Review" value={pendingReviewCount} icon={CheckSquare} trend="Awaiting" onClick={() => onNavigateToTab('submissions')} />
        <StatCard title="Cloud Credits" value={`$${totalCredits}`} icon={Cloud} onClick={() => onNavigateToTab('credits')} />
        <StatCard title="Attendance Days" value={attendanceDays} icon={CalendarCheck} onClick={() => onNavigateToTab('attendance')} />
        <StatCard title="Progress" value={`${Math.round((approvedTaskCount / (tasks.length || 1)) * 100)}%`} icon={TrendingUp} trend="Keep going" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">My Submission Status</h3>
            <TrendingUp size={18} className="text-gold" />
          </div>
          <div className="space-y-3">
            {SUBMISSION_STATUS_BUCKETS.map(({ label, statuses, barClass }) => {
              const count = submissions.filter((s) => statuses.includes(s.status)).length;
              const total = submissions.length || 1;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-300">{label}</span>
                    <span className="text-gray-400">{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-zinc-750 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${barClass}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">My Cloud Credits</h3>
            <Cloud size={18} className="text-gold" />
          </div>
          <div className="space-y-3">
            {myCredits.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-4">No credits assigned yet</p>
            )}
            {myCredits.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 bg-zinc-750/30 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-white">{c.provider}</div>
                  <div className="text-xs text-gray-500">Code: {c.code}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-gold">${c.amount}</div>
                  <div className="text-xs text-gray-500">Exp: {c.expiry_date ?? 'N/A'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
