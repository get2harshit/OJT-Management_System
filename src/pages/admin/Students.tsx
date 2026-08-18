import { useState, useEffect, useCallback, useRef } from 'react';
import { Edit2, UserCheck, UserX, History, LogIn, LogOut, ArrowLeftRight, Briefcase } from 'lucide-react';
import DataTable from '../../components/DataTable';
import PageLayout from '../../components/PageLayout';
import SpinnerSquare from '../../components/SpinnerSquare';
import Select from '../../components/Select';
import Modal from '../../components/Modal';
import ActionsMenu from '../../components/ActionsMenu';
import type { ApiStudent } from '../../lib/types';
import {
  apiListStudentsPage,
  apiListStudentBatches,
  apiUpdateStudentBatch,
  apiSetIndividualOverride,
  apiGetStudentActivityHistory,
  type StudentActivityEvent,
} from '../../lib/api';
import { useToast } from '../../toast';
import { usePageRefresh } from '../../context/RefreshContext';

const BATCH_FORMAT = /^[0-9]{4} [A-Z]$/;
const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

// Real backend roster (GET /api/v1/students, server-paginated). The backend
// only exposes a batch-update endpoint so far — no full student edit/delete
// yet — so batch is the one editable field here.
export default function AdminStudents() {
  const { showSuccess, showError } = useToast();
  const [students, setStudents] = useState<ApiStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [batches, setBatches] = useState<string[]>([]);
  const [selectedBatch, setSelectedBatch] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [editingStudent, setEditingStudent] = useState<ApiStudent | null>(null);
  const [batchInput, setBatchInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [historyStudent, setHistoryStudent] = useState<ApiStudent | null>(null);
  const [historyEvents, setHistoryEvents] = useState<StudentActivityEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchStudents = useCallback(async () => {
    try {
      const res = await apiListStudentsPage({
        page,
        limit,
        batch: selectedBatch ? [selectedBatch] : undefined,
        search: search || undefined,
      });
      setStudents(res.data);
      setPagination(res.pagination);
    } catch {
      setStudents([]);
    }
  }, [page, limit, selectedBatch, search]);

  const loadBatches = useCallback(() => {
    return apiListStudentBatches().then(setBatches).catch(() => setBatches([]));
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  useEffect(() => {
    setTableLoading(true);
    fetchStudents().finally(() => {
      setTableLoading(false);
      setLoading(false);
    });
  }, [fetchStudents]);

  usePageRefresh(useCallback(() => Promise.all([loadBatches(), fetchStudents()]), [loadBatches, fetchStudents]));

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearchChange = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleBatchFilterChange = (value: string) => {
    setPage(1);
    setSelectedBatch(value);
  };

  const handleLimitChange = (value: number) => {
    setPage(1);
    setLimit(value);
  };

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

  const openHistory = async (student: ApiStudent) => {
    setHistoryStudent(student);
    setHistoryLoading(true);
    try {
      const events = await apiGetStudentActivityHistory(student.id);
      setHistoryEvents(events);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to load history');
      setHistoryEvents([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeHistory = () => {
    setHistoryStudent(null);
    setHistoryEvents([]);
  };

  const formatEventDate = (iso: string) =>
    new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const describeEvent = (event: StudentActivityEvent) => {
    const team = event.teamName || 'an unnamed team';
    switch (event.type) {
      case 'team_joined':
        return { icon: LogIn, iconClass: 'text-green-400', text: `Joined ${team}` };
      case 'team_left':
        return { icon: LogOut, iconClass: 'text-red-400', text: `Left ${team}` };
      case 'mentor_changed':
        return {
          icon: ArrowLeftRight,
          iconClass: 'text-gold',
          text: `Mentor changed on ${team}: ${event.fromMentorName ?? 'unassigned'} → ${event.toMentorName ?? 'unassigned'}`,
        };
      case 'project_changed': {
        // The first allocation reads as "Project allocated", not as a change
        // from "unallocated" — nothing was taken away, and phrasing it as a
        // change would make every student's history open with a non-event.
        const from = event.fromProjectTitle;
        const to = event.toProjectTitle;
        if (!from && to) {
          return { icon: Briefcase, iconClass: 'text-sky-400', text: `Project allocated on ${team}: ${to}` };
        }
        if (from && !to) {
          return { icon: Briefcase, iconClass: 'text-red-400', text: `Project removed from ${team} (was ${from})` };
        }
        return {
          icon: Briefcase,
          iconClass: 'text-sky-400',
          text: `Project changed on ${team}: ${from ?? 'none'} → ${to ?? 'none'}`,
        };
      }
    }
  };

  const data = students.map(s => ({
    id: s.id,
    roll_number: s.rollNumber ?? '-',
    name: s.fullName ?? '-',
    email: s.email ?? '-',
    batch: s.batch ?? '-',
    currentTier: s.currentTier ?? '-',
    activeStatus: s.activeStatus,
  }));

  return (
    <PageLayout className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Students</h1>
        <p className="text-gray-400 text-sm mt-1">All enrolled students</p>
      </div>

      {loading ? (
        <div className="min-h-[50vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : (
        <DataTable
          loading={tableLoading}
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
          onSearchChange={handleSearchChange}
          serverPagination={{
            page: pagination.page,
            limit: pagination.limit,
            total: pagination.total,
            totalPages: pagination.totalPages,
            onPageChange: setPage,
            onLimitChange: handleLimitChange,
          }}
          leftHeaderContent={
            <Select
              variant="filter"
              className="min-w-[160px]"
              value={selectedBatch}
              onChange={handleBatchFilterChange}
              placeholder="All Batches"
              options={batches.map(b => ({ value: b, label: b }))}
            />
          }
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
                  { label: 'History', icon: History, onClick: () => openHistory(student) },
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

      <Modal open={!!historyStudent} onClose={closeHistory} title="Activity History" size="lg">
        <div className="space-y-4">
          <p className="text-gray-400 text-sm">
            Team and mentor changes for{' '}
            <span className="text-white font-semibold">{historyStudent?.fullName || historyStudent?.email}</span>
          </p>
          {historyLoading ? (
            <div className="min-h-[20vh] flex items-center justify-center">
              <SpinnerSquare size={32} />
            </div>
          ) : historyEvents.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-6">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {historyEvents.map((event, i) => {
                const { icon: Icon, iconClass, text } = describeEvent(event);
                return (
                  <li key={i} className="flex items-start gap-3 pb-3 border-b border-zinc-800 last:border-0">
                    <Icon size={16} className={`mt-0.5 shrink-0 ${iconClass}`} />
                    <div className="min-w-0">
                      <p className="text-sm text-white">{text}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatEventDate(event.at)}
                        {event.reason ? ` — ${event.reason}` : ''}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>
    </PageLayout>
  );
}
