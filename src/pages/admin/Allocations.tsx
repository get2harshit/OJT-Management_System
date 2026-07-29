import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shuffle, Calendar, RefreshCw } from 'lucide-react';
import DataTable from '../../components/DataTable';
import SpinnerSquare from '../../components/SpinnerSquare';
import Button from '../../components/Button';
import type { Cohort } from '../../lib/types';
import { apiListCohorts } from '../../lib/api';
import { getDurationString, formatDateDisplay } from '../../lib/utils';
import { getCohortLabel, getSemesterSessionLabel } from '../../lib/cohortLabel';
import { useToast } from '../../toast';
import { usePageRefresh } from '../../context/RefreshContext';

export default function AdminAllocations() {
  const navigate = useNavigate();
  const { showError } = useToast();
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCohorts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiListCohorts();
      setCohorts(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to load cohorts');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchCohorts();
  }, [fetchCohorts]);

  usePageRefresh(fetchCohorts);

  const cohortData = cohorts.map(c => ({
    ...c,
    label: getCohortLabel(c),
    sessionTermMapped: getSemesterSessionLabel(c.sessionTerm),
    duration: getDurationString(c.startDate, c.endDate),
  }));

  const goToAllocations = (cohortId: string) => navigate(`/admin/dashboard/ojts/${cohortId}/allocations`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shuffle className="text-gold" size={26} />
            Project Allocations
          </h1>
          <p className="text-gray-400 text-sm mt-1">Select a cohort to run or review its project allocation.</p>
        </div>
        <Button
          variant="secondary"
          onClick={fetchCohorts}
          disabled={loading}
          leftIcon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />}
        >
          Refresh
        </Button>
      </div>

      {loading && cohortData.length === 0 ? (
        <div className="min-h-[50vh] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <SpinnerSquare size={48} />
            <p className="text-gray-500 text-sm">Loading cohorts…</p>
          </div>
        </div>
      ) : (
        <DataTable
          columns={[
            { key: 'label', header: 'Cohort Name' },
            { key: 'sessionTermMapped', header: 'Semester' },
            {
              key: 'startDate',
              header: 'Start Date',
              render: (row) => <span>{formatDateDisplay(row.startDate)}</span>,
            },
            {
              key: 'endDate',
              header: 'End Date',
              render: (row) => <span>{formatDateDisplay(row.endDate)}</span>,
            },
            {
              key: 'duration',
              header: 'Duration',
              render: (row) => (
                <span className="flex items-center gap-1 text-gray-300 text-xs">
                  <Calendar size={14} className="text-gold" />
                  {row.duration}
                </span>
              ),
            },
            {
              key: 'isActive',
              header: 'Status',
              render: (row) => (
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${row.isActive ? 'text-green-500' : 'text-gray-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${row.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                  {row.isActive ? 'Active' : 'Inactive'}
                </span>
              ),
            },
          ]}
          data={cohortData}
          searchPlaceholder="Search cohorts..."
          onRowClick={(row) => goToAllocations(row.id)}
          actions={(row) => (
            <button
              onClick={() => goToAllocations(row.id)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-zinc-750 text-white font-semibold rounded-lg hover:bg-zinc-700 transition-colors"
            >
              <Shuffle size={14} />
              Allocate Projects
            </button>
          )}
        />
      )}
    </div>
  );
}
