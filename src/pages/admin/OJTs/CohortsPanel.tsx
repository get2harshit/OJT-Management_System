import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Calendar, RefreshCw, Briefcase, Edit2, UserCog, Users2, Shuffle } from 'lucide-react';
import DataTable from '../../../components/DataTable';
import Modal from '../../../components/Modal';
import ActionsMenu from '../../../components/ActionsMenu';
import SpinnerSquare from '../../../components/SpinnerSquare';
import type { Cohort } from '../../../lib/types';
import { apiListCohorts, apiCreateCohort, apiUpdateCohort, apiGetCohort, apiDeleteCohort } from '../../../lib/api';
import { getDurationString, formatDateDisplay, toDateOnly } from '../../../lib/utils';
import { getCohortLabel, getSemesterSessionLabel } from '../../../lib/cohortLabel';
import CohortFormFields from './CohortFormFields';
import { computeCohortDefaultsFromStartDate, EMPTY_COHORT_FORM, validateCohortForm } from '../../../lib/cohortForm';
import Button from '../../../components/Button';
import { useToast } from '../../../toast';

export default function CohortsPanel() {
  const navigate = useNavigate();
  const { showError } = useToast();
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCohortId, setEditingCohortId] = useState<string | null>(null);
  const [cohortModalOpen, setCohortModalOpen] = useState(false);
  const [cohortForm, setCohortForm] = useState(EMPTY_COHORT_FORM);
  const [eligibleBatchOptions, setEligibleBatchOptions] = useState<string[]>([]);

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

  const closeCohortModal = () => {
    setCohortModalOpen(false);
    setEditingCohortId(null);
    setCohortForm(EMPTY_COHORT_FORM);
    setEligibleBatchOptions([]);
  };

  const handleSaveCohort = async () => {
    const error = validateCohortForm(cohortForm);
    if (error) {
      showError(error);
      return;
    }
    try {
      const body = {
        name: cohortForm.name,
        allowedBatches: cohortForm.allowedBatches,
        sessionTerm: cohortForm.sessionTerm,
        startDate: cohortForm.startDate,
        endDate: cohortForm.endDate,
        isActive: cohortForm.isActive,
      };
      if (editingCohortId) {
        await apiUpdateCohort(editingCohortId, body);
      } else {
        await apiCreateCohort(body);
      }
      closeCohortModal();
      await fetchCohorts();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to save cohort');
    }
  };

  const handleEditCohort = async (id: string) => {
    setEditingCohortId(id);
    setCohortModalOpen(true);
    try {
      const cohort = await apiGetCohort(id);
      const allowedBatches = Array.isArray(cohort.allowedBatches) ? cohort.allowedBatches : [cohort.allowedBatches].filter(Boolean) as string[];
      const startDate = toDateOnly(cohort.startDate);
      // Union with the recomputed eligible options so existing selections
      // outside the formula (e.g. from data saved before this logic existed)
      // still show up as checked options instead of silently vanishing.
      const computedOptions = startDate ? computeCohortDefaultsFromStartDate(startDate).eligibleBatchOptions : [];
      setEligibleBatchOptions(Array.from(new Set([...computedOptions, ...allowedBatches])));
      setCohortForm({
        name: cohort.name ?? '',
        allowedBatches,
        sessionTerm: cohort.sessionTerm,
        startDate,
        endDate: toDateOnly(cohort.endDate),
        isActive: cohort.isActive,
      });
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to load cohort');
      closeCohortModal();
    }
  };

  const handleDeleteCohort = async (id: string) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this OJT cohort?");
    if (!confirmDelete) return;
    try {
      await apiDeleteCohort(id);
      setCohorts(prev => prev.filter(c => c.id !== id));
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to delete cohort');
    }
  };

  const cohortData = cohorts.map(c => ({
    ...c,
    label: getCohortLabel(c),
    sessionTermMapped: getSemesterSessionLabel(c.sessionTerm),
    duration: getDurationString(c.startDate, c.endDate),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-lg font-bold text-white">Cohorts & Batches</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={fetchCohorts}
            disabled={loading}
            leftIcon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />}
          >
            Refresh
          </Button>
          <Button
            onClick={() => setCohortModalOpen(true)}
            leftIcon={<Plus size={16} />}
            className="hover:scale-105"
          >
            Create Cohort
          </Button>
        </div>
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
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${row.isActive ? 'bg-green-400/10 text-green-400' : 'bg-gray-400/10 text-gray-400'
                  }`}>
                  {row.isActive ? 'Active' : 'Inactive'}
                </span>
              ),
            },
          ]}
          data={cohortData}
          searchPlaceholder="Search cohorts..."
          onRowClick={(row) => navigate(`/admin/dashboard/ojts/${row.id}/view`)}
          actions={(row) => (
            <ActionsMenu
              items={[
                { label: 'Edit OJT', icon: Edit2, onClick: () => handleEditCohort(row.id) },
                { label: 'Select Project', icon: Briefcase, onClick: () => navigate(`/admin/dashboard/ojts/${row.id}/projects`) },
                // { label: 'Select Student', icon: Users, onClick: () => navigate(`/admin/dashboard/ojts/${row.id}/students`) },
                { label: 'Select Mentor', icon: UserCog, onClick: () => navigate(`/admin/dashboard/ojts/${row.id}/mentors`) },
                { label: 'Manage Teams', icon: Users2, onClick: () => navigate(`/admin/dashboard/ojts/${row.id}/teams`) },
                { label: 'Allocate Projects', icon: Shuffle, onClick: () => navigate(`/admin/dashboard/ojts/${row.id}/allocations`) },
                { label: 'Delete OJT', icon: Trash2, onClick: () => handleDeleteCohort(row.id), danger: true },
              ]}
            />
          )}
        />
      )}

      {/* Create / Edit Cohort Modal */}
      <Modal
        open={cohortModalOpen}
        onClose={closeCohortModal}
        title={editingCohortId ? 'Edit OJT Cohort' : 'Create OJT Cohort'}
      >
        <div className="space-y-4">
          <CohortFormFields
            form={cohortForm}
            onChange={setCohortForm}
            eligibleBatchOptions={eligibleBatchOptions}
            onEligibleBatchOptionsChange={setEligibleBatchOptions}
          />
          <button
            onClick={handleSaveCohort}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors"
          >
            {editingCohortId ? 'Update Cohort' : 'Create Cohort'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
