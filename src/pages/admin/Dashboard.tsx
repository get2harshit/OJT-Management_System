import { useState, useMemo } from 'react';
import { Users, CheckSquare, FolderOpen, Cloud, CalendarCheck, TrendingUp } from 'lucide-react';
import StatCard from '../../components/StatCard';
import type { Profile, Student, Task, Submission, Credit, Attendance, Semester, Batch } from '../../lib/types';

interface Props {
  profiles: Profile[];
  students: Student[];
  tasks: Task[];
  submissions: Submission[];
  credits: Credit[];
  attendance: Attendance[];
  semesters: Semester[];
  batches: Batch[];
}

export default function AdminDashboard({ profiles, students, tasks, submissions, credits, attendance, semesters, batches }: Props) {
  const [semFilter, setSemFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [trackFilter, setTrackFilter] = useState('');

  const distinctSemesters = useMemo(() => {
    const ids = [...new Set(students.map(s => s.semester_id).filter(Boolean))] as string[];
    return semesters.filter(s => ids.includes(s.id));
  }, [students, semesters]);

  const filteredBatches = useMemo(() => {
    if (!semFilter) return batches;
    return batches.filter(b => b.semester_id === semFilter);
  }, [semFilter, batches]);

  const distinctTracks = useMemo(() => {
    return [...new Set(students.map(s => s.track).filter(Boolean))] as string[];
  }, [students]);

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      if (semFilter && s.semester_id !== semFilter) return false;
      if (batchFilter && s.batch_id !== batchFilter) return false;
      if (trackFilter && s.track !== trackFilter) return false;
      return true;
    });
  }, [students, semFilter, batchFilter, trackFilter]);

  const studentIds = new Set(filteredStudents.map(s => s.user_id));

  const studentCount = filteredStudents.length;
  const mentorCount = profiles.filter(p => p.role === 'MENTOR').length;
  const taskCount = tasks.length;
  const filteredSubmissions = submissions.filter(s => studentIds.has(s.student_id));
  const pendingSubmissions = filteredSubmissions.filter(s => s.status === 'PENDING').length;
  const filteredCredits = credits.filter(c => studentIds.has(c.student_id));
  const totalCredits = filteredCredits.reduce((sum, c) => sum + Number(c.amount), 0);
  const filteredAttendance = attendance.filter(a => studentIds.has(a.student_id));
  const attendanceCount = filteredAttendance.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Overview of the OJT management system</p>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3">
        <select value={semFilter} onChange={e => { setSemFilter(e.target.value); setBatchFilter(''); }} className="bg-zinc-850 border border-zinc-750 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold min-w-[160px]">
          <option value="">All Semesters</option>
          {distinctSemesters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={batchFilter} onChange={e => setBatchFilter(e.target.value)} className="bg-zinc-850 border border-zinc-750 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold min-w-[160px]">
          <option value="">All Batches</option>
          {filteredBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={trackFilter} onChange={e => setTrackFilter(e.target.value)} className="bg-zinc-850 border border-zinc-750 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold min-w-[160px]">
          <option value="">All Tracks</option>
          {distinctTracks.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
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
            {filteredSubmissions.slice(-5).reverse().map(sub => (
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
