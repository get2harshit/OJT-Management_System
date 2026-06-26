import { useState } from 'react';
import { CalendarCheck, CheckCircle2 } from 'lucide-react';
import DataTable from '../../components/DataTable';
import type { Attendance, Profile, Student } from '../../lib/types';

interface Props {
  attendance: Attendance[];
  profiles: Profile[];
  students: Student[];
}

export default function MentorAttendance({ attendance, profiles, students }: Props) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const data = attendance
    .filter((a) => a.date === selectedDate)
    .map((a) => {
      const student = profiles.find((p) => p.id === a.student_id);
      return {
        ...a,
        student_name: student?.name ?? '-',
      };
    });

  const presentIds = new Set(data.map((d) => d.student_id));
  const absentStudents = students.filter((s) => !presentIds.has(s.user_id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Attendance</h1>
          <p className="text-gray-400 text-sm mt-1">Track daily student attendance</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
          />
          <button className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200">
            <CalendarCheck size={18} />
            Mark All Present
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-semibold text-green-400 uppercase tracking-wider mb-3">Present ({data.length})</h3>
          <DataTable
            columns={[
              { key: 'student_name', header: 'Student' },
              { key: 'date', header: 'Date' },
            ]}
            data={data}
          />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-3">Absent ({absentStudents.length})</h3>
          <div className="bg-zinc-850 border border-zinc-750 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-750 bg-zinc-750/30">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium uppercase tracking-wider text-xs">Student</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {absentStudents.map((s) => {
                  const p = profiles.find((pr) => pr.id === s.user_id);
                  return (
                    <tr key={s.user_id} className="border-b border-zinc-750/50 hover:bg-zinc-750/20 transition-colors">
                      <td className="px-4 py-3 text-gray-300">{p?.name ?? '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <button className="p-1.5 text-gray-400 hover:text-green-400 transition-colors" title="Mark Present">
                          <CheckCircle2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {absentStudents.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-gray-500">All students present</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
