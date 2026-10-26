import { useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CalendarCheck } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import SessionAttendancePanel from '../../components/SessionAttendancePanel';
import { apiListSessions } from '../../lib/api';
import AttendanceSummary from './AttendanceSummary';

type AttendanceTab = 'mark' | 'summary';

const TABS: { id: AttendanceTab; label: string; description: string }[] = [
  { id: 'mark', label: 'Mark attendance', description: 'Mark attendance per session — pick a date, then a session on that date.' },
  { id: 'summary', label: 'Student summary', description: "Every student's attendance across the OJT, lowest first." },
];

export default function AdminAttendance() {
  const { cohortId } = useParams<{ cohortId: string }>();
  // In the URL so a link or a refresh lands on the same tab.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: AttendanceTab = searchParams.get('tab') === 'summary' ? 'summary' : 'mark';
  const active = TABS.find((tab) => tab.id === activeTab)!;

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
        <p className="text-gray-400 text-sm mt-1">{active.description}</p>
      </div>

      <div className="flex border-b border-zinc-750">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSearchParams(tab.id === 'mark' ? {} : { tab: tab.id }, { replace: true })}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
              activeTab === tab.id ? 'border-gold text-gold' : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {cohortId && activeTab === 'mark' && <SessionAttendancePanel loadSessionsForDate={loadSessionsForDate} />}
      {cohortId && activeTab === 'summary' && <AttendanceSummary cohortId={cohortId} />}
    </PageLayout>
  );
}
