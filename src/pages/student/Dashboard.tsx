import { CheckSquare, FolderOpen, Cloud, CalendarCheck, TrendingUp, Clock } from 'lucide-react';
import StatCard from '../../components/StatCard';
import type { Task, Submission, Credit, Attendance } from '../../lib/types';

import { useTasks } from '../../hooks/useTasks';
import { useSubmissions } from '../../hooks/useSubmissions';
import { useCredits } from '../../hooks/useCredits';
import { useAttendance } from '../../hooks/useAttendance';

interface Props {
  studentId: string;
  tasks: Task[];
  submissions: Submission[];
  credits: Credit[];
  attendance: Attendance[];
}

export default function StudentDashboard({
  studentId,
  tasks: propTasks,
  submissions: propSubmissions,
  credits: propCredits,
  attendance: propAttendance,
}: Partial<Props> & { studentId: string }) {
  const { tasks: hookTasks } = useTasks();
  const { submissions: hookSubmissions } = useSubmissions();
  const { credits: hookCredits } = useCredits();
  const { attendance: hookAttendance } = useAttendance();

  const tasks = propTasks ?? hookTasks ?? [];
  const submissions = propSubmissions ?? hookSubmissions ?? [];
  const credits = propCredits ?? hookCredits ?? [];
  const attendance = propAttendance ?? hookAttendance ?? [];
  const mySubmissions = submissions.filter((s) => s.student_id === studentId);
  const myCredits = credits.filter((c) => c.student_id === studentId);
  const myAttendance = attendance.filter((a) => a.student_id === studentId);

  const pendingTasks = tasks.filter((t) => {
    const hasSubmission = mySubmissions.some((s) => s.task_id === t.id && s.status === 'ACCEPTED');
    return !hasSubmission;
  }).length;

  const acceptedCount = mySubmissions.filter((s) => s.status === 'ACCEPTED').length;
  const returnedCount = mySubmissions.filter((s) => s.status === 'RETURNED').length;
  const pendingCount = mySubmissions.filter((s) => s.status === 'PENDING').length;

  const totalCredits = myCredits.reduce((sum, c) => sum + Number(c.amount), 0);
  const attendanceDays = myAttendance.length;

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Student Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Track your OJT progress and tasks</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 sm:gap-6">
        <StatCard title="Pending Tasks" value={pendingTasks} icon={Clock} trend="To do" />
        <StatCard title="Submissions" value={mySubmissions.length} icon={FolderOpen} />
        <StatCard title="Pending Review" value={pendingCount} icon={CheckSquare} trend="Awaiting" />
        <StatCard title="Cloud Credits" value={`$${totalCredits}`} icon={Cloud} />
        <StatCard title="Attendance Days" value={attendanceDays} icon={CalendarCheck} />
        <StatCard title="Progress" value={`${Math.round((acceptedCount / (tasks.length || 1)) * 100)}%`} icon={TrendingUp} trend="Keep going" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">My Submission Status</h3>
            <TrendingUp size={18} className="text-gold" />
          </div>
          <div className="space-y-3">
            {[
              { label: 'Accepted', count: acceptedCount, color: 'bg-green-500' },
              { label: 'Pending', count: pendingCount, color: 'bg-yellow-500' },
              { label: 'Returned', count: returnedCount, color: 'bg-red-500' },
            ].map((item) => {
              const total = mySubmissions.length || 1;
              const pct = Math.round((item.count / total) * 100);
              return (
                <div key={item.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-300">{item.label}</span>
                    <span className="text-gray-400">{item.count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-zinc-750 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${item.color}`} style={{ width: `${pct}%` }} />
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
