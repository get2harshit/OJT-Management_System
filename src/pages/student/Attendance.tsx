import { CalendarCheck } from 'lucide-react';
import DataTable from '../../components/DataTable';
import type { Attendance, Profile } from '../../lib/types';

import { useAttendance } from '../../hooks/useAttendance';
import { useData } from '../../context/DataContext';

interface Props {
  studentId: string;
  attendance: Attendance[];
  profiles: Profile[];
}

export default function StudentAttendance({
  studentId,
  attendance: propAttendance,
  profiles: propProfiles,
}: Partial<Props> & { studentId: string }) {
  const { attendance: hookAttendance } = useAttendance();
  const { profiles: hookProfiles } = useData();

  const attendance = propAttendance ?? hookAttendance;
  const profiles = propProfiles ?? hookProfiles;
  const myAttendance = attendance.filter((a) => a.student_id === studentId);

  const data = myAttendance.map((a) => {
    const student = profiles.find((p) => p.id === a.student_id);
    return {
      ...a,
      student_name: student?.name ?? '-',
    };
  });

  const presentCount = myAttendance.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">My Attendance</h1>
          <p className="text-gray-400 text-sm mt-1">Track your attendance records</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 text-green-400 rounded-lg text-sm font-medium">
          <CalendarCheck size={16} />
          {presentCount} Days Present
        </div>
      </div>

      <DataTable
        columns={[
          { key: 'student_name', header: 'Student' },
          { key: 'date', header: 'Date' },
          { key: 'marked_at', header: 'Marked At' },
        ]}
        data={data}
        searchPlaceholder="Search attendance..."
      />
    </div>
  );
}
