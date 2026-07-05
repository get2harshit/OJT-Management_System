import { useState, useMemo } from 'react';
import { Users, CheckSquare, FolderOpen, CalendarCheck, TrendingUp } from 'lucide-react';
import StatCard from '../../components/StatCard';
import Select from '../../components/Select';
import type { Profile, Student, Task, Submission, Attendance, Semester, Batch } from '../../lib/types';

interface Props {
  mentorId: string;
  profiles: Profile[];
  students: Student[];
  tasks: Task[];
  submissions: Submission[];
  attendance: Attendance[];
  semesters: Semester[];
  batches: Batch[];
}

export default function MentorDashboard({ mentorId, profiles: _profiles, students, tasks, submissions, attendance, semesters, batches }: Props) {
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

  const myTasks = tasks.filter(t => t.mentor_id === mentorId || t.assigned_to === null);
  const mySubmissions = submissions.filter(s => studentIds.has(s.student_id));
  const pendingSubmissions = mySubmissions.filter(s => s.status === 'PENDING').length;
  const filteredAttendance = attendance.filter(a => studentIds.has(a.student_id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Mentor Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Overview of your assigned students and tasks</p>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3">
        <Select
          variant="filter"
          className="min-w-[160px]"
          value={semFilter}
          onChange={v => { setSemFilter(v); setBatchFilter(''); }}
          placeholder="All Semesters"
          options={distinctSemesters.map(s => ({ value: s.id, label: s.name }))}
        />
        <Select
          variant="filter"
          className="min-w-[160px]"
          value={batchFilter}
          onChange={setBatchFilter}
          placeholder="All Batches"
          options={filteredBatches.map(b => ({ value: b.id, label: b.name }))}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard title="My Students" value={filteredStudents.length} icon={Users} />
        <StatCard title="My Tasks" value={myTasks.length} icon={CheckSquare} />
        <StatCard title="Pending Reviews" value={pendingSubmissions} icon={FolderOpen} trend="Needs review" />
        <StatCard title="Attendance Records" value={filteredAttendance.length} icon={CalendarCheck} />
        <StatCard title="Avg Progress" value="72%" icon={TrendingUp} trend="+5%" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
