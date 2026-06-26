import { Users, CheckSquare, FolderOpen, Cloud, CalendarCheck, TrendingUp } from 'lucide-react';
import StatCard from '../../components/StatCard';
import type { Profile, Student, Task, Submission, Credit, Attendance } from '../../lib/types';

interface Props {
  profiles: Profile[];
  students: Student[];
  tasks: Task[];
  submissions: Submission[];
  credits: Credit[];
  attendance: Attendance[];
}

export default function AdminDashboard({ profiles, students, tasks, submissions, credits, attendance }: Props) {
  const studentCount = students.length;
  const mentorCount = profiles.filter((p) => p.role === 'MENTOR').length;
  const taskCount = tasks.length;
  const pendingSubmissions = submissions.filter((s) => s.status === 'PENDING').length;
  const totalCredits = credits.reduce((sum, c) => sum + Number(c.amount), 0);
  const attendanceCount = attendance.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Overview of the OJT management system</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard title="Students" value={studentCount} icon={Users} trend="+2 this week" />
        <StatCard title="Mentors" value={mentorCount} icon={Users} />
        <StatCard title="Tasks" value={taskCount} icon={CheckSquare} />
        <StatCard title="Pending Submissions" value={pendingSubmissions} icon={FolderOpen} trend="Needs review" />
        <StatCard title="Cloud Credits" value={`$${totalCredits}`} icon={Cloud} />
        <StatCard title="Attendance Records" value={attendanceCount} icon={CalendarCheck} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Submission Status</h3>
            <TrendingUp size={18} className="text-gold" />
          </div>
          <div className="space-y-3">
            {['PENDING', 'ACCEPTED', 'RETURNED'].map((status) => {
              const count = submissions.filter((s) => s.status === status).length;
              const pct = submissions.length ? Math.round((count / submissions.length) * 100) : 0;
              return (
                <div key={status}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-300">{status}</span>
                    <span className="text-gray-400">{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-zinc-750 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        status === 'PENDING' ? 'bg-yellow-500' : status === 'ACCEPTED' ? 'bg-green-500' : 'bg-red-500'
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
            {submissions.slice(-5).reverse().map((sub) => (
              <div key={sub.id} className="flex items-center gap-3 text-sm">
                <div className={`w-2 h-2 rounded-full ${
                  sub.status === 'PENDING' ? 'bg-yellow-500' : sub.status === 'ACCEPTED' ? 'bg-green-500' : 'bg-red-500'
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
