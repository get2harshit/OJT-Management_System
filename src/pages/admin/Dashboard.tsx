import { useState, useMemo, useEffect, useCallback } from 'react';
import { Users, CheckSquare, FolderOpen, Cloud, UserCog, Briefcase, Download } from 'lucide-react';
import { exportToCSV } from '../../lib/csvExport';
import StatCard from '../../components/StatCard';
import Select from '../../components/Select';
import SpinnerSquare from '../../components/SpinnerSquare';
import CohortProgressPanel from '../../components/CohortProgressPanel';
import type { DashboardMetrics, Cohort } from '../../lib/types';
import {
  apiGetDashboardMetrics,
  apiListCohorts,
} from '../../lib/api';
import { buildCohortOptions } from '../../lib/cohortLabel';
import { usePageRefresh } from '../../context/RefreshContext';

import { useTracks } from '../../hooks/useTracks';

// The submissions/attendance props and their DataContext hooks are gone with
// the two panels that used them: both were localStorage mock data, and nothing
// ever passed the props — the route renders this with onNavigateToSection
// alone. Every number on this page now comes from the backend.
interface Props {
  onNavigateToSection: (tab: string) => void;
}

export default function AdminDashboard({ onNavigateToSection }: Props) {
  const { options: trackOptions } = useTracks();
  const [semFilter, setSemFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [trackFilter, setTrackFilter] = useState('');

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loadingReal, setLoadingReal] = useState(true);

  // Every stat card is a real backend count, server-filtered by the cohort/
  // batch/track selection above.
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);

  const loadCohorts = useCallback(() => {
    return apiListCohorts()
      .then(setCohorts)
      .catch((err) => console.error('Dashboard failed to load cohorts', err))
      .finally(() => setLoadingReal(false));
  }, []);

  useEffect(() => {
    loadCohorts();
  }, [loadCohorts]);

  // Stat-card counts — server-filtered by the current cohort/batch/track
  // selection, so no full roster needs to be downloaded just to show a number.
  const loadMetrics = useCallback(() => {
    return apiGetDashboardMetrics({ cohortId: semFilter || undefined, batch: batchFilter || undefined, track: trackFilter || undefined })
      .then(setMetrics)
      .catch((err) => console.error('Dashboard failed to load metrics', err));
  }, [semFilter, batchFilter, trackFilter]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  usePageRefresh(useCallback(() => Promise.all([loadCohorts(), loadMetrics()]), [loadCohorts, loadMetrics]));

  const semesterOptions = useMemo(() => {
    return buildCohortOptions(cohorts);
  }, [cohorts]);

  const batchOptions = useMemo(() => {
    if (semFilter) {
      const cohort = cohorts.find(c => c.id === semFilter);
      return (cohort?.allowedBatches || []).map(b => ({ value: b, label: b }));
    }
    const all = cohorts.flatMap(c => c.allowedBatches || []);
    return Array.from(new Set(all)).sort().map(b => ({ value: b, label: b }));
  }, [semFilter, cohorts]);

  // Stat-card counts — always straight from /dashboard/metrics, which is
  // re-fetched with the current cohort/batch/track filters above. No client
  // list is downloaded just to compute one of these.
  const showStudentsCount = metrics ? metrics.studentsCount : '—';
  const showMentorsCount = metrics ? metrics.mentorsCount : '—';
  const showBatchManagersCount = metrics ? metrics.batchManagersCount : '—';
  const showProjectsCount = metrics ? metrics.projectsCount : '—';
  const showTasksCount = metrics ? metrics.tasksCount : '—';
  const showPendingSubmissionsCount = metrics ? metrics.pendingSubmissionsCount : '—';

  if (loadingReal) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <SpinnerSquare size={48} />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">Overview of the OJT management system</p>
        </div>
        <button
          onClick={() => {
            exportToCSV('admin_dashboard_metrics', [
              {
                studentsCount: showStudentsCount,
                mentorsCount: showMentorsCount,
                projectsCount: showProjectsCount,
                creditsAvailable: metrics?.totalCreditsAvailable ?? 0,
                activeFilterCohort: semFilter ? (cohorts.find(c => c.id === semFilter)?.name || semFilter) : 'All Cohorts',
              }
            ]);
          }}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-gold text-black rounded-lg hover:bg-gold-hover transition-colors shadow-sm"
        >
          <Download size={15} />
          Export Dashboard CSV
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3">
        <Select
          variant="filter"
          className="min-w-[160px]"
          value={semFilter}
          onChange={v => { setSemFilter(v); setBatchFilter(''); }}
          placeholder="All Cohorts"
          options={semesterOptions}
        />
        <Select
          variant="filter"
          className="min-w-[160px]"
          value={batchFilter}
          onChange={setBatchFilter}
          placeholder="All Batches"
          options={batchOptions}
        />
        <Select
          variant="filter"
          className="min-w-[160px]"
          value={trackFilter}
          onChange={setTrackFilter}
          placeholder="All Tracks"
          options={trackOptions}
        />
      </div>

      {/* Stat Cards — Students/Mentors/Batch Managers/Projects/Credits/Tasks/
          Pending Submissions are real backend counts; only Attendance stays
          mock since the metrics endpoint has no data for it yet. Each card
          jumps to its matching sidebar tab, except Batch Managers which has
          no page yet. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatCard title="Students" value={showStudentsCount} icon={Users} onClick={() => onNavigateToSection('students')} />
        <StatCard title="Mentors" value={showMentorsCount} icon={Users} onClick={() => onNavigateToSection('mentors')} />
        <StatCard title="Batch Managers" value={showBatchManagersCount} icon={UserCog} />
        <StatCard title="Projects" value={showProjectsCount} icon={Briefcase} onClick={() => onNavigateToSection('ojts')} />
        <StatCard title="Cloud Credits" value={metrics ? `$${metrics.totalCreditsAvailable}` : '—'} icon={Cloud} onClick={() => onNavigateToSection('credits')} />
        <StatCard title="Tasks" value={showTasksCount} icon={CheckSquare} onClick={() => onNavigateToSection('tasks')} />
        <StatCard title="Pending Submissions" value={showPendingSubmissionsCount} icon={FolderOpen} trend="Needs review" onClick={() => onNavigateToSection('submissions')} />
      </div>

      {/* Was two panels drawn from mock data in localStorage — a submission
          breakdown and an "activity feed" that were never wired to a backend
          and so showed the same invented rows for every cohort. Replaced with
          real progress, which needs one OJT to be about: a funnel summed
          across cohorts describes nothing. */}
      {semFilter ? (
        <CohortProgressPanel cohortId={semFilter} />
      ) : (
        <div className="border border-dashed border-zinc-800 rounded-xl py-16 flex flex-col items-center justify-center gap-2 px-4 text-center">
          <p className="text-gray-400 text-sm">Pick an OJT above to see how it is moving.</p>
          <p className="text-gray-600 text-xs">Where its students are, what is blocking them, and this week's sessions.</p>
        </div>
      )}
    </div>
  );
}
