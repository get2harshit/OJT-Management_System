import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, Check, Eye } from 'lucide-react';
import DataTable from '../../../components/DataTable';
import Modal from '../../../components/Modal';
import SpinnerSquare from '../../../components/SpinnerSquare';
import StudentDetailCard, { EMPTY_PROJECTS_MAP, resolveTeamAssignment } from './StudentDetailCard';
import type { ApiStudent, TeamAllocationDetail } from '../../../lib/types';
import { apiListStudents, apiGetCohort, apiAddStudentsToCohort, apiGetStudent } from '../../../lib/api';
import { apiGetTeamsForCohortDetailed } from '../../../lib/api/allocations';
import { useToast } from '../../../toast';
import { usePageRefresh } from '../../../context/RefreshContext';

type StudentRow = ApiStudent & Record<string, unknown>;

export default function CohortStudentsPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();

  const [eligibleStudents, setEligibleStudents] = useState<StudentRow[]>([]);
  // Already on the OJT before this visit — read once, never toggled off here
  // (the backend has no unmap endpoint, mirroring CohortMentorsPage).
  const [alreadyMapped, setAlreadyMapped] = useState<Set<string>>(new Set());
  // Ticked during this visit, kept separate from alreadyMapped so save knows
  // exactly what is new without diffing two lists.
  const [toAdd, setToAdd] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Detail view — opened via the row's "view details" icon, kept separate
  // from the checkbox toggle so browsing a student's team/project/mentor
  // never disturbs the in-progress cohort-mapping selection underneath it.
  const [detailStudentId, setDetailStudentId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailStudent, setDetailStudent] = useState<ApiStudent | null>(null);
  const [detailTeam, setDetailTeam] = useState<TeamAllocationDetail | null>(null);

  const openDetail = useCallback(async (studentId: string) => {
    setDetailStudentId(studentId);
    if (!cohortId) return;
    setDetailLoading(true);
    try {
      const [student, teamsRes] = await Promise.all([
        apiGetStudent(studentId),
        apiGetTeamsForCohortDetailed(cohortId, { studentId, limit: 1 }),
      ]);
      setDetailStudent(student);
      setDetailTeam(teamsRes.data[0] ?? null);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to load student detail');
      setDetailStudent(null);
    } finally {
      setDetailLoading(false);
    }
  }, [cohortId, showError]);

  const closeDetail = () => {
    setDetailStudentId(null);
    setDetailStudent(null);
    setDetailTeam(null);
  };

  const fetchData = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    try {
      const [students, details] = await Promise.all([
        apiListStudents({ cohortId }),
        apiGetCohort(cohortId, true),
      ]);
      setEligibleStudents(students as StudentRow[]);
      setAlreadyMapped(new Set(details.students.map(s => s.id)));
      setToAdd(new Set());
    } catch (err: unknown) {
      console.error(err);
      showError('Failed to load students eligible for this cohort.');
      navigate(-1);
    } finally {
      setLoading(false);
    }
  }, [cohortId, navigate, showError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  usePageRefresh(fetchData);

  const toggleOne = (row: StudentRow) => {
    if (alreadyMapped.has(row.id)) return;
    setToAdd(prev => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  };

  // Acts on the full eligible list — this page fetches every eligible
  // student up front rather than paging server-side, so there is no
  // separate "matches search" set to reconcile against a single page.
  const selectable = eligibleStudents.filter(s => !alreadyMapped.has(s.id)).map(s => s.id);
  const allSelected = selectable.length > 0 && selectable.every(id => toAdd.has(id));

  const toggleAll = () => {
    setToAdd(prev => {
      const next = new Set(prev);
      if (allSelected) selectable.forEach(id => next.delete(id));
      else selectable.forEach(id => next.add(id));
      return next;
    });
  };

  // Additive only — the backend has no unmap endpoint, so only newly
  // checked students (not present in the original mapping) are sent.
  const handleSave = async () => {
    if (!cohortId || toAdd.size === 0) {
      navigate(-1);
      return;
    }
    setSaving(true);
    try {
      await apiAddStudentsToCohort(cohortId, Array.from(toAdd));
      showSuccess('Cohort students updated successfully!');
      navigate(-1);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to map students to cohort');
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-x-4 gap-y-2 flex-wrap">
        <p className="text-sm text-gray-400">
          {toAdd.size > 0 ? (
            <>
              <span className="text-emerald-400">+{toAdd.size} to add</span>
              <span className="text-gray-500"> — unsaved</span>
            </>
          ) : (
            `${alreadyMapped.size} student${alreadyMapped.size === 1 ? '' : 's'} on this OJT`
          )}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-zinc-800 border border-zinc-700 text-gray-300 font-medium rounded-lg hover:border-zinc-600 hover:text-white transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={toAdd.size === 0 || saving}
            className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200 text-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <Save size={16} />
            {saving ? 'Adding...' : 'Add to OJT'}
          </button>
        </div>
      </div>

      {saving && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm">
          <SpinnerSquare size={72} />
          <p className="text-sm text-gray-300">Adding students…</p>
        </div>
      )}

      <DataTable<StudentRow>
        columns={[
          {
            key: 'select',
            header: '',
            headerRender: () => (
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                disabled={selectable.length === 0}
                title="Select every student who isn't already on the OJT"
                className="rounded bg-zinc-750 border-zinc-650 accent-gold focus:ring-gold cursor-pointer disabled:opacity-30"
              />
            ),
            render: (row) =>
              alreadyMapped.has(row.id) ? (
                // Locked rather than pre-ticked: there is no unmap endpoint, so
                // an editable checkbox here would offer a removal that silently
                // never happens.
                <span title="Already on this OJT" className="text-emerald-400 flex">
                  <Check size={15} />
                </span>
              ) : (
                <input
                  type="checkbox"
                  readOnly
                  checked={toAdd.has(row.id)}
                  className="rounded bg-zinc-750 border-zinc-650 accent-gold pointer-events-none"
                />
              ),
          },
          {
            key: 'fullName',
            header: 'Name',
            render: (row) => (
              <span className={`flex items-center gap-2.5 ${alreadyMapped.has(row.id) ? 'text-gray-400' : 'text-white'}`}>
                <span className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center shrink-0">
                  <span className="text-[10px] text-gray-400 font-bold">{(row.fullName || row.email || '?')[0].toUpperCase()}</span>
                </span>
                {row.fullName || row.email || row.id}
              </span>
            ),
          },
          {
            key: 'email',
            header: 'Email',
            render: (row) => (
              <span className="text-xs text-gray-400 truncate block max-w-[240px]">{row.email || '—'}</span>
            ),
          },
          {
            key: 'rollNumber',
            header: 'Roll Number',
            render: (row) => <span className="text-gray-300">{row.rollNumber || '—'}</span>,
          },
          {
            key: 'batch',
            header: 'Batch',
            render: (row) => <span className="text-gray-300">{row.batch || '—'}</span>,
          },
        ]}
        data={eligibleStudents}
        searchKeys={['fullName', 'email', 'rollNumber']}
        loading={loading}
        onRowClick={toggleOne}
        searchPlaceholder="Search name, email or roll number..."
        hideExport
        actions={(row) => (
          <button
            type="button"
            title="View student details"
            onClick={(e) => {
              e.stopPropagation();
              openDetail(row.id);
            }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gold hover:bg-zinc-750 transition-colors"
          >
            <Eye size={14} />
          </button>
        )}
      />

      <Modal open={!!detailStudentId} onClose={closeDetail} title="Student Details" size="xl">
        {detailLoading ? (
          <div className="flex items-center justify-center py-16">
            <SpinnerSquare size={40} />
          </div>
        ) : !detailStudent ? (
          <p className="p-4 text-gray-500 text-xs">Student not found.</p>
        ) : (
          <StudentDetailCard
            student={detailStudent}
            team={detailTeam ?? undefined}
            teammate={(() => {
              const teammateMember = detailTeam?.members.find(m => m.studentId !== detailStudentId);
              return teammateMember
                ? { id: teammateMember.studentId, fullName: teammateMember.fullName, batch: teammateMember.batch ?? undefined, email: teammateMember.email ?? undefined }
                : undefined;
            })()}
            assignment={detailTeam ? resolveTeamAssignment(detailTeam, EMPTY_PROJECTS_MAP) : null}
            onBack={closeDetail}
          />
        )}
      </Modal>
    </div>
  );
}
