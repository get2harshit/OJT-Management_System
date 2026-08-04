import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Plus, ArrowLeft, Table2 } from 'lucide-react';
import SpinnerSquare from '../../components/SpinnerSquare';
import DataTable from '../../components/DataTable';
import PageLayout from '../../components/PageLayout';
import { AddEvaluationModal } from './OJTs/AddEvaluationModal';
import type { Cohort, CohortDetails, CohortEvaluationConfig, EvaluationMode } from '../../lib/types';
import { apiListCohorts, apiGetCohort } from '../../lib/api';
import { apiListCohortEvaluationConfigs } from '../../lib/api/evaluations';
import { getCohortLabel, getSemesterSessionLabel } from '../../lib/cohortLabel';
import { formatDateDisplay } from '../../lib/utils';
import { useToast } from '../../toast';
import { usePageRefresh } from '../../context/RefreshContext';

const MODE_LABELS: Record<EvaluationMode, string> = {
  upload: 'Upload',
  rubric: 'Rubric',
};

// Task/Evaluation are inherently cohort-scoped, so this page is cohort-first:
// pick a cohort, then see the evaluations already set up for it (Viva, Final
// Presentation, Logbook, PRD, Attendance…) in one table, and add more. The
// per-student breakdown lives elsewhere — this screen is just the cohort's
// evaluation setup at a glance.
export default function AdminEvaluationTracker() {
  const navigate = useNavigate();
  const { showError } = useToast();
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loadingCohorts, setLoadingCohorts] = useState(true);
  const [selectedCohort, setSelectedCohort] = useState<CohortDetails | null>(null);
  const [loadingCohortDetail, setLoadingCohortDetail] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const [configs, setConfigs] = useState<CohortEvaluationConfig[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);

  const loadCohorts = useCallback(async () => {
    try {
      setCohorts(await apiListCohorts());
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to load cohorts');
    } finally {
      setLoadingCohorts(false);
    }
  }, [showError]);

  useEffect(() => {
    loadCohorts();
  }, [loadCohorts]);

  const loadConfigs = useCallback(async (cohortId: string) => {
    setLoadingConfigs(true);
    try {
      setConfigs(await apiListCohortEvaluationConfigs(cohortId));
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to load evaluations');
    } finally {
      setLoadingConfigs(false);
    }
  }, [showError]);

  const selectCohort = useCallback(async (cohortId: string) => {
    setLoadingCohortDetail(true);
    try {
      setSelectedCohort(await apiGetCohort(cohortId, true));
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to load cohort');
    } finally {
      setLoadingCohortDetail(false);
    }
  }, [showError]);

  // Refresh the evaluations table whenever a cohort is (re)selected.
  useEffect(() => {
    if (selectedCohort) {
      loadConfigs(selectedCohort.id);
    } else {
      setConfigs([]);
    }
  }, [selectedCohort, loadConfigs]);

  const backToCohorts = () => {
    setSelectedCohort(null);
    setConfigs([]);
  };

  usePageRefresh(
    useCallback(
      () => Promise.all([loadCohorts(), selectedCohort ? loadConfigs(selectedCohort.id) : Promise.resolve()]),
      [loadCohorts, loadConfigs, selectedCohort],
    ),
  );

  // Evaluations only make sense once teams are actually locked in and the
  // cohort is a live, running one — `allocationPublishedAt` (a sticky
  // one-way flag) is the source of truth for "ever published," not the
  // volatile `allocationRunStatus` enum, which can cycle back to draft/review
  // if new teams are added post-publish (see the allocations module).
  const isEvaluationEligible = !!selectedCohort?.isActive && !!selectedCohort?.allocationPublishedAt;

  const configRows = configs.map((c) => ({
    id: c.id,
    evaluation: c.sequenceNo ? `${c.evaluationTypeTemplate.name} ${c.sequenceNo}` : c.evaluationTypeTemplate.name,
    mode: c.evaluationTypeTemplate.mode,
    maxMarks: c.maxMarksSnapshot,
    startDate: c.startDate,
    endDate: c.endDate,
    isActive: c.isActive,
  }));

  return (
    <PageLayout className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Award className="text-gold" size={26} />
          Evaluation Tracker
        </h1>
        <p className="text-gray-400 text-sm mt-1">Pick a cohort to set up and track its Viva, Final Presentation, Logbook, PRD and Attendance evaluations.</p>
      </div>

      {!selectedCohort ? (
        loadingCohorts ? (
          <div className="flex justify-center py-16">
            <SpinnerSquare size={40} />
          </div>
        ) : cohorts.length === 0 ? (
          <p className="text-gray-500 text-sm">No cohorts found.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cohorts.map((c) => (
              <button
                key={c.id}
                onClick={() => selectCohort(c.id)}
                className="text-left px-4 py-3.5 rounded-xl border bg-zinc-900 border-zinc-800 text-gray-300 hover:bg-zinc-850 hover:text-white hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm truncate">{getCohortLabel(c)}</span>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.isActive ? 'bg-emerald-400' : 'bg-gray-500'}`} />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {getSemesterSessionLabel(c.sessionTerm)} · {formatDateDisplay(c.startDate)} → {formatDateDisplay(c.endDate)}
                </p>
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-3 flex-1 min-h-0 flex flex-col [&>*]:shrink-0">
          <button
            onClick={backToCohorts}
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white px-2.5 py-1.5 -ml-2.5 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft size={13} /> Back to cohorts
          </button>

          <h2 className="text-white text-lg font-bold">{getCohortLabel(selectedCohort)}</h2>

          {loadingCohortDetail ? (
            <div className="flex justify-center py-16">
              <SpinnerSquare size={40} />
            </div>
          ) : !isEvaluationEligible ? (
            <div className="border border-dashed border-zinc-800 rounded-xl py-16 flex flex-col items-center justify-center gap-2 text-center px-6">
              <Award size={22} className="text-gray-600 mb-1" />
              <p className="text-gray-400 text-sm font-medium">Evaluation isn't available yet for this cohort.</p>
              <p className="text-gray-500 text-xs max-w-sm">
                Evaluations can only be set up once this cohort's team allocations are published and the cohort is running.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-gray-400 text-sm">
                  {configs.length} evaluation{configs.length !== 1 ? 's' : ''} set up
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/admin/dashboard/ojts/${selectedCohort.id}/evaluation-summary`)}
                    title="Evaluation summary (all evaluations)"
                    className="flex items-center gap-1.5 p-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-750 transition-colors"
                  >
                    <Table2 size={16} />
                  </button>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 active:scale-95 transition-all duration-200 text-sm shadow-md shadow-gold/10"
                  >
                    <Plus size={16} />
                    Add Evaluation
                  </button>
                </div>
              </div>

              {loadingConfigs ? (
                <div className="flex justify-center py-16">
                  <SpinnerSquare size={36} />
                </div>
              ) : configs.length === 0 ? (
                <div className="border border-dashed border-zinc-800 rounded-xl py-16 flex flex-col items-center justify-center gap-2 text-center px-6">
                  <Award size={22} className="text-gray-600 mb-1" />
                  <p className="text-gray-400 text-sm font-medium">No evaluations set up for this cohort yet.</p>
                  <p className="text-gray-500 text-xs max-w-sm">Use “Add Evaluation” to create the first one.</p>
                </div>
              ) : (
                <DataTable
                  columns={[
                    { key: 'evaluation', header: 'Evaluation' },
                    {
                      key: 'mode',
                      header: 'Mode',
                      render: (row) => (
                        <span className="text-gray-300">{MODE_LABELS[row.mode as EvaluationMode] ?? (row.mode as string)}</span>
                      ),
                    },
                    {
                      key: 'maxMarks',
                      header: 'Max Marks',
                      render: (row) => <span className="text-gray-300">{row.maxMarks as number}</span>,
                    },
                    {
                      key: 'window',
                      header: 'Window',
                      render: (row) => (
                        <span className="text-gray-400 text-xs">
                          {formatDateDisplay(row.startDate as string)} → {formatDateDisplay(row.endDate as string)}
                        </span>
                      ),
                    },
                    {
                      key: 'isActive',
                      header: 'Status',
                      render: (row) => (
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${row.isActive ? 'text-green-500' : 'text-gray-400'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${row.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                          {row.isActive ? 'Active' : 'Draft'}
                        </span>
                      ),
                    },
                  ]}
                  data={configRows}
                  searchPlaceholder="Search evaluations..."
                  hideExport
                  onRowClick={(row) => navigate(`/admin/dashboard/ojts/${selectedCohort.id}/evaluation/${row.id}`)}
                />
              )}
            </>
          )}
        </div>
      )}

      {showAddModal && selectedCohort && (
        <AddEvaluationModal
          cohortId={selectedCohort.id}
          cohortMentors={selectedCohort.mentors || []}
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false);
            if (selectedCohort) loadConfigs(selectedCohort.id);
          }}
        />
      )}
    </PageLayout>
  );
}
