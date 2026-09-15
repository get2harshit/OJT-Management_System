import PageLayout from '../../../components/PageLayout';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Award, Plus, Table2, FileBarChart2, Eye, Pencil, Trash2 } from 'lucide-react';
import DataTable from '../../../components/DataTable';
import SpinnerSquare from '../../../components/SpinnerSquare';
import { AddEvaluationModal } from './AddEvaluationModal';
import { EditEvaluationConfigModal } from './EditEvaluationConfigModal';
import { ViewEvaluationConfigModal } from './ViewEvaluationConfigModal';
import type { CohortDetails, CohortEvaluationConfig, EvaluationMode } from '../../../lib/types';
import { apiListCohortEvaluationConfigs, apiDeleteCohortEvaluationConfig } from '../../../lib/api/evaluations';
import { apiGetCohort } from '../../../lib/api';
import { formatDateDisplay } from '../../../lib/utils';
import { useToast } from '../../../toast';
import { useConfirm } from '../../../confirm';
import { usePageRefresh } from '../../../context/RefreshContext';

const MODE_LABELS: Record<EvaluationMode, string> = {
  upload: 'Upload',
  rubric: 'Rubric',
};

export default function CohortEvaluationSummaryPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();
  const confirm = useConfirm();

  // Fetched with the roster included so this same call also carries what the
  // configured-evaluations section below needs (isActive, allocationPublishedAt,
  // mentors for the Add Evaluation modal) — no second cohort fetch.
  const [cohort, setCohort] = useState<CohortDetails | null>(null);
  const allowedBatches = cohort?.allowedBatches ?? [];
  const [loading, setLoading] = useState(true);

  // Evaluations only make sense once teams are actually locked in and the
  // cohort is a live, running one — `allocationPublishedAt` (a sticky
  // one-way flag) is the source of truth for "ever published," not the
  // volatile `allocationRunStatus` enum, which can cycle back to draft/review
  // if new teams are added post-publish (see the allocations module).
  const isEvaluationEligible = !!cohort?.isActive && !!cohort?.allocationPublishedAt;
  const [configs, setConfigs] = useState<CohortEvaluationConfig[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<CohortEvaluationConfig | null>(null);
  const [viewingConfig, setViewingConfig] = useState<CohortEvaluationConfig | null>(null);

  const fetchCohort = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    try {
      setCohort(await apiGetCohort(cohortId, true));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load cohort');
    } finally {
      setLoading(false);
    }
  }, [cohortId, showError]);

  useEffect(() => {
    fetchCohort();
  }, [fetchCohort]);

  const loadConfigs = useCallback(async () => {
    if (!cohortId) return;
    setLoadingConfigs(true);
    try {
      setConfigs(await apiListCohortEvaluationConfigs(cohortId));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load evaluations');
    } finally {
      setLoadingConfigs(false);
    }
  }, [cohortId, showError]);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  usePageRefresh(useCallback(async () => {
    await Promise.all([fetchCohort(), loadConfigs()]);
  }, [fetchCohort, loadConfigs]));

  const handleDeleteConfig = async (config: CohortEvaluationConfig) => {
    const ok = await confirm({
      title: 'Delete evaluation',
      message: `Delete "${config.sequenceNo ? `${config.evaluationTypeTemplate.name} ${config.sequenceNo}` : config.evaluationTypeTemplate.name}"? Only possible while nothing under it has been scored yet — the server will say so if it can't.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await apiDeleteCohortEvaluationConfig(config.id);
      showSuccess('Evaluation deleted.');
      loadConfigs();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete evaluation');
    }
  };

  const configRows = configs.map((c) => ({
    id: c.id,
    evaluation: c.sequenceNo ? `${c.evaluationTypeTemplate.name} ${c.sequenceNo}` : c.evaluationTypeTemplate.name,
    // Empty scope = every track, every batch — the same audience a config
    // has always covered, so this reads "All students" rather than blank.
    scope:
      c.scope.trackNames.length === 0 && c.scope.batches.length === 0
        ? 'All students'
        : [c.scope.trackNames.join(', '), c.scope.batches.join(', ')].filter(Boolean).join(' · '),
    mode: c.evaluationTypeTemplate.mode,
    maxMarks: c.maxMarksSnapshot,
    startDate: c.startDate,
    endDate: c.endDate,
    isActive: c.isActive,
  }));

  return (
    <PageLayout className="space-y-3">

      {loading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : !isEvaluationEligible ? (
        <div className="border border-dashed border-zinc-800 rounded-xl py-10 flex flex-col items-center justify-center gap-2 text-center px-6">
          <Award size={22} className="text-gray-600 mb-1" />
          <p className="text-gray-400 text-sm font-medium">Evaluation isn't available yet for this cohort.</p>
          <p className="text-gray-500 text-xs max-w-sm">
            Evaluations can only be set up once this cohort's team allocations are published and the cohort is running.
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 text-white font-semibold text-sm">
              <Table2 size={16} className="text-gold" />
              Configured Evaluations
              <span className="text-gray-500 font-normal">
                ({configs.length} set up)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(`/admin/dashboard/ojts/${cohortId}/evaluation-reports`)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-zinc-850 border border-zinc-750 rounded-lg text-gray-300 hover:text-white hover:border-gold/40 transition-colors"
              >
                <FileBarChart2 size={14} />
                View Reports
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors"
              >
                <Plus size={14} />
                Add Evaluation
              </button>
            </div>
          </div>

          {loadingConfigs ? (
            <div className="flex justify-center py-8">
              <SpinnerSquare size={28} />
            </div>
          ) : configs.length === 0 ? (
            <p className="text-gray-500 text-xs py-4 text-center">No evaluations set up for this cohort yet — use “Add Evaluation” to create the first one.</p>
          ) : (
            <DataTable
              columns={[
                { key: 'evaluation', header: 'Evaluation' },
                {
                  key: 'scope',
                  header: 'Audience',
                  render: (row) => <span className="text-gray-400 text-xs">{row.scope as string}</span>,
                },
                {
                  key: 'mode',
                  header: 'Mode',
                  render: (row) => <span className="text-gray-300">{MODE_LABELS[row.mode as EvaluationMode] ?? (row.mode as string)}</span>,
                },
                { key: 'maxMarks', header: 'Max Marks', render: (row) => <span className="text-gray-300">{row.maxMarks as number}</span> },
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
                {
                  key: 'actions',
                  header: '',
                  render: (row) => {
                    const config = configs.find((c) => c.id === row.id);
                    if (!config) return null;
                    return (
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingConfig(config);
                          }}
                          title="View rubric and mentor pairings"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors"
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingConfig(config);
                          }}
                          title="Edit dates / panel size"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteConfig(config);
                          }}
                          title="Delete"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  },
                },
              ]}
              data={configRows}
              hideExport
              onRowClick={(row) => navigate(`/admin/dashboard/ojts/${cohortId}/evaluation/${row.id}`)}
            />
          )}
        </div>
      )}

      {showAddModal && cohortId && (
        <AddEvaluationModal
          cohortId={cohortId}
          cohortMentors={cohort?.mentors || []}
          allowedBatches={allowedBatches}
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false);
            loadConfigs();
          }}
        />
      )}

      {editingConfig && (
        <EditEvaluationConfigModal
          config={editingConfig}
          cohortMentors={cohort?.mentors || []}
          onClose={() => setEditingConfig(null)}
          onUpdated={loadConfigs}
        />
      )}

      {viewingConfig && (
        <ViewEvaluationConfigModal
          config={viewingConfig}
          cohortMentors={cohort?.mentors || []}
          onClose={() => setViewingConfig(null)}
        />
      )}
    </PageLayout>
  );
}
