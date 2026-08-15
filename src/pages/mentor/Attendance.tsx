import { useState, useEffect, useCallback } from 'react';
import { CalendarCheck } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import Select from '../../components/Select';
import SessionAttendancePanel from '../../components/SessionAttendancePanel';
import type { Cohort } from '../../lib/types';
import { apiListMyCohorts, apiGetMySessions } from '../../lib/api';
import { getCohortLabel } from '../../lib/cohortLabel';

export default function MentorAttendance() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortId, setCohortId] = useState('');

  useEffect(() => {
    apiListMyCohorts()
      .then(setCohorts)
      .catch(() => setCohorts([]));
  }, []);

  useEffect(() => {
    if (cohorts.length === 0) return;
    setCohortId((prev) => prev || cohorts.find((c) => c.isActive)?.id || cohorts[0]?.id || prev);
  }, [cohorts]);

  const loadSessionsForDate = useCallback(
    async (date: string) => {
      if (!cohortId) return [];
      const res = await apiGetMySessions({ cohortId, from: date, to: date, limit: 100 });
      return res.data;
    },
    [cohortId]
  );

  return (
    <PageLayout className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <CalendarCheck size={24} className="text-gold" />
            Attendance
          </h1>
          <p className="text-gray-400 text-sm mt-1">Mark attendance for your own sessions — pick a date, then a session on that date.</p>
        </div>
        <Select
          value={cohortId}
          onChange={setCohortId}
          variant="filter"
          placeholder="Select cohort"
          className="w-[200px]"
          options={cohorts.map((c) => ({ value: c.id, label: getCohortLabel(c) }))}
        />
      </div>

      {cohortId && <SessionAttendancePanel loadSessionsForDate={loadSessionsForDate} />}
    </PageLayout>
  );
}
