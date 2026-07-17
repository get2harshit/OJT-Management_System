import { useState, useEffect, useMemo, useCallback } from 'react';
import { Edit2, UserCheck, UserX } from 'lucide-react';
import DataTable from '../../components/DataTable';
import SpinnerSquare from '../../components/SpinnerSquare';
import Select from '../../components/Select';
import Modal from '../../components/Modal';
import ActionsMenu from '../../components/ActionsMenu';
import type { ApiStudent } from '../../lib/types';
import { apiListStudents, apiUpdateStudentBatch, apiSetIndividualOverride } from '../../lib/api';
import { useToast } from '../../toast';

const BATCH_FORMAT = /^[0-9]{4} [A-Z]$/;

// Real backend roster (GET /api/v1/students, unfiltered). The backend only
// exposes a batch-update endpoint so far — no full student edit/delete yet —
// so batch is the one editable field here.
export default function AdminStudents() {
  const { showSuccess, showError } = useToast();
  const [students, setStudents] = useState<ApiStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState('');
  const [editingStudent, setEditingStudent] = useState<ApiStudent | null>(null);
  const [batchInput, setBatchInput] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchStudents = useCallback(() => {
    setLoading(true);
    return apiListStudents()
      .then(setStudents)
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const openEditBatch = (student: ApiStudent) => {
    setEditingStudent(student);
    setBatchInput(student.batch && student.batch !== '-' ? student.batch : '');
  };

  const closeEditBatch = () => {
    setEditingStudent(null);
    setBatchInput('');
  };

  const handleSaveBatch = async () => {
    if (!editingStudent) return;
    if (!BATCH_FORMAT.test(batchInput)) {
      showError('Batch must be in format "YYYY X" (e.g. 2025 A)');
      return;
    }
    setSaving(true);
    try {
      await apiUpdateStudentBatch(editingStudent.id, batchInput);
      showSuccess('Batch updated successfully!');
      closeEditBatch();
      await fetchStudents();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to update batch');
    } finally {
      setSaving(false);
    }
  };

  // Grants (or revokes) this student's permission to do an individual
  // project regardless of batch — independent of the batch-mandated
  // individual-only rule, which no admin action can override.
  const handleToggleIndividualOverride = async (student: ApiStudent) => {
    if (!student.activeCohortId) {
      showError('Student is not part of any active cohort yet.');
      return;
    }
    const nextAllowed = !student.allowedAsIndividual;
    try {
      await apiSetIndividualOverride(student.id, student.activeCohortId, nextAllowed);
      showSuccess(nextAllowed ? 'Student allowed to do an individual project.' : 'Individual project permission revoked.');
      await fetchStudents();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to update individual project permission');
    }
  };

  // Unique sorted batch values from the API data
  const batches = useMemo(() => {
    const vals = students.map(s => s.batch).filter((b): b is string => !!b && b !== '-');
    return Array.from(new Set(vals)).sort();
  }, [students]);

  const filtered = useMemo(() => {
    return selectedBatch
      ? students.filter(s => s.batch === selectedBatch)
      : students;
  }, [students, selectedBatch]);

  const data = filtered.map(s => ({
    id: s.id,
    roll_number: s.rollNumber ?? '-',
    name: s.fullName ?? '-',
    email: s.email ?? '-',
    batch: s.batch ?? '-',
    currentTier: s.currentTier ?? '-',
    activeStatus: s.activeStatus,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Students</h1>
        <p className="text-gray-400 text-sm mt-1">All enrolled students</p>
      </div>

      {!loading && batches.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <Select
            variant="filter"
            className="min-w-[160px]"
            value={selectedBatch}
            onChange={setSelectedBatch}
            placeholder="All Batches"
            options={batches.map(b => ({ value: b, label: b }))}
          />
        </div>
      )}

      {loading ? (
        <div className="min-h-[50vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : (
        <DataTable
          columns={[
            { key: 'roll_number', header: 'Roll Number' },
            { key: 'name', header: 'Name' },
            { key: 'email', header: 'Email' },
            { key: 'batch', header: 'Batch' },
            { key: 'currentTier', header: 'Tier' },
            {
              key: 'activeStatus',
              header: 'Status',
              render: (row) => (
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                  row.activeStatus === false ? 'text-gray-400' : 'text-green-500'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${row.activeStatus === false ? 'bg-gray-400' : 'bg-green-500'}`} />
                  {row.activeStatus === false ? 'Inactive' : 'Active'}
                </span>
              ),
            },
          ]}
          data={data}
          searchPlaceholder="Search students..."
          actions={(row) => {
            const student = students.find(s => s.id === row.id);
            if (!student) return null;
            const isAllowedIndividual = !!student.allowedAsIndividual;
            return (
              <ActionsMenu
                items={[
                  { label: 'Edit Batch', icon: Edit2, onClick: () => openEditBatch(student) },
                  {
                    label: isAllowedIndividual ? 'Revoke Individual Project' : 'Allow Individual Project',
                    icon: isAllowedIndividual ? UserX : UserCheck,
                    onClick: () => handleToggleIndividualOverride(student),
                  },
                ]}
              />
            );
          }}
        />
      )}

      <Modal open={!!editingStudent} onClose={closeEditBatch} title="Edit Batch">
        <div className="space-y-4">
          <p className="text-gray-400 text-sm">
            Updating batch for <span className="text-white font-semibold">{editingStudent?.fullName || editingStudent?.email}</span>
          </p>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Batch (YYYY X)</label>
            <input
              type="text"
              value={batchInput}
              onChange={e => setBatchInput(e.target.value)}
              placeholder="2025 A"
              className="w-full bg-zinc-800 text-white text-sm border border-zinc-700 rounded-lg px-3 py-2 focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/30"
            />
          </div>
          <button
            onClick={handleSaveBatch}
            disabled={saving}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Batch'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
