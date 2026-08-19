import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarCheck } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import SessionAttendancePanel from '../../components/SessionAttendancePanel';
import { apiListSessions } from '../../lib/api';

export default function AdminAttendance() {
  const { cohortId } = useParams<{ cohortId: string }>();

  const loadSessionsForDate = useCallback(
    async (date: string) => {
      if (!cohortId) return [];
      const res = await apiListSessions({ cohortId, from: date, to: date, limit: 100 });
      return res.data;
    },
    [cohortId]
  );

  return (
    <PageLayout className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <CalendarCheck size={24} className="text-gold" />
          Attendance
        </h1>
        <p className="text-gray-400 text-sm mt-1">Mark attendance per session — pick a date, then a session on that date.</p>
      </div>

      {cohortId && <SessionAttendancePanel loadSessionsForDate={loadSessionsForDate} />}
    </PageLayout>
  );
}
