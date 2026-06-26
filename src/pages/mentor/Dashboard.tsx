import { Users, CheckSquare, FolderOpen, Cloud, CalendarCheck, TrendingUp } from 'lucide-react';
import StatCard from '../../components/StatCard';
import type { Profile, Student, Task, Submission, Credit, Attendance } from '../../lib/types';

interface Props {
  mentorId: string;
  profiles: Profile[];
  students: Student[];
  tasks: Task[];
  submissions: Submission[];
  credits: Credit[];
  attendance: Attendance[];
}

export default function MentorDashboard({ mentorId, profiles, students, tasks, submissions, credits, attendance }: Props) {
  // In a real app we'd filter by mentor assignment; here we show all for demo
  const myStudents = students;
  const myTasks = tasks.filter((t) => t.mentor_id === mentorId || t.is_common);
  const mySubmissions = submissions.filter((s) => myStudents.some((st) => st.user_id === s.student_id));
  const pendingSubmissions = mySubmissions.filter((s) => s.status === 'PENDING').length;
  const totalCredits = credits.reduce((sum, c) => sum + Number(c.amount), 0);
  const attendanceCount = attendance.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Mentor Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Overview of your assigned students and tasks</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard title="My Students" value={myStudents.length} icon={Users} />
        <StatCard title="My Tasks" value={myTasks.length} icon={CheckSquare} />
        <StatCard title="Pending Reviews" value={pendingSubmissions} icon={FolderOpen} trend="Needs review" />
        <StatCard title="Cloud Credits" value={`$${totalCredits}`} icon={Cloud} />
        <StatCard title="Attendance Records" value={attendanceCount} icon={CalendarCheck} />
        <StatCard title="Avg Progress" value="72%" icon={TrendingUp} trend="+5%" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Submission Status</h3>
            <TrendingUp size={18} className="text-gold" />
          </div>
          <div className="space-y-3">
            {['PENDING', 'ACCEPTED', 'RETURNED'].map((status) => {
              const count = mySubmissions.filter((s) => s.status === status).length;
              const pct = mySubmissions.length ? Math.round((count / mySubmissions.length) * 100) : 0;
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
            <h3 className="text-lg font-semibold text-white">Upcoming Deadlines</h3>
          </div>
          <div className="space-y-3">
            {myTasks
              .filter((t) => t.due_date)
              .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
              .slice(0, 5)
              .map((task) => (
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
