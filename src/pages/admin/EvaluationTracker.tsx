import { useState, useEffect, useCallback } from 'react';
import { Award, Plus, ArrowLeft, Loader2 } from 'lucide-react';
import SpinnerSquare from '../../components/SpinnerSquare';
import Select from '../../components/Select';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import { AddEvaluationModal } from './OJTs/AddEvaluationModal';
import type { Cohort, CohortDetails, ApiStudent, StudentEvaluationSummary, EvaluationDetail } from '../../lib/types';
import { apiListCohorts, apiGetCohort, apiListStudentsPage } from '../../lib/api';
import { apiGetEvaluationsForStudent, apiGetEvaluationDetail } from '../../lib/api/evaluations';
import { getCohortLabel, getSemesterSessionLabel } from '../../lib/cohortLabel';
import { formatDateDisplay } from '../../lib/utils';
import { TRACKS } from '../../lib/constants';
import { useToast } from '../../toast';

// Read-only rubric breakdown for one evaluation — admin is never a panelist
// (see EvaluationService's bulk-assign — only the primary mentor + paired
// external mentor ever get a panelist row), so this only ever displays,
// never scores.
function EvaluationDetailModal({ evaluationId, onClose }: { evaluationId: string; onClose: () => void }) {
  const { showError } = useToast();
  const [detail, setDetail] = useState<EvaluationDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGetEvaluationDetail(evaluationId)
      .then((res) => { if (!cancelled) setDetail(res); })
      .catch((err: unknown) => { if (!cancelled) showError(err instanceof Error ? err.message : 'Failed to load evaluation'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [evaluationId, showError]);

  return (
    <Modal open onClose={onClose} title="Evaluation Breakdown">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={28} className="animate-spin text-gray-500" />
        </div>
      ) : detail ? (
        <div className="space-y-4">
          <div>
            <h4 className="text-white font-semibold">
              {detail.studentName} — {detail.sequenceNo ? `${detail.evaluationTypeName} ${detail.sequenceNo}` : detail.evaluationTypeName}
            </h4>
            <p className="text-xs text-gold mt-1">
              {detail.finalMarksObtained !== null ? `Final (best of panel): ${detail.finalMarksObtained}/${detail.maxMarksSnapshot}` : 'Not evaluated yet'}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Criteria (max marks)</p>
            {detail.criteria.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
                <span className="text-gray-300">{c.name}</span>
                <span className="text-gray-500">/ {c.maxMarks}</span>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Panelists</p>
            {detail.panelists.length === 0 ? (
              <p className="text-gray-500 text-sm">No panelists assigned.</p>
            ) : (
              detail.panelists.map((p) => (
                <div key={p.evaluatorId} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-200">{p.evaluatorName || 'Unknown'} ({p.role === 'external' ? 'External' : 'Internal'})</span>
                    <span className={p.totalMarks !== null ? 'text-gold font-semibold' : 'text-gray-500'}>
                      {p.totalMarks !== null ? `${p.totalMarks}/${detail.maxMarksSnapshot}` : 'Not scored yet'}
                    </span>
                  </div>
                  {p.feedback && <p className="text-xs text-gray-500">{p.feedback}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

// A student's evaluation status for one cohort — fetched on demand once a
// student is selected on the left, rendered on the right.
function StudentEvaluationDetail({
  student,
  cohortId,
  onBack,
}: {
  student: ApiStudent;
  cohortId: string;
  onBack: () => void;
}) {
  const { showError } = useToast();
  const [evaluations, setEvaluations] = useState<StudentEvaluationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailEvaluationId, setDetailEvaluationId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const all = await apiGetEvaluationsForStudent(student.id);
        if (!cancelled) setEvaluations(all.filter((e) => e.cohortId === cohortId));
      } catch (err: unknown) {
        if (!cancelled) showError(err instanceof Error ? err.message : 'Failed to load evaluations');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [student.id, cohortId, showError]);

  return (
    <div className="p-4 space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white px-2.5 py-1.5 -ml-2.5 rounded-lg hover:bg-zinc-800 transition-colors lg:hidden"
      >
        <ArrowLeft size={13} /> Back
      </button>

      <div className="text-center py-4 border-b border-zinc-800">
        <h2 className="text-white text-lg font-bold">{student.fullName || student.email}</h2>
        <p className="text-gray-500 text-xs mt-1">{student.rollNumber || '—'} · {student.batch || 'No batch'}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <SpinnerSquare size={32} />
        </div>
      ) : evaluations.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">No evaluations set up for this cohort yet.</p>
      ) : (
        <div className="space-y-2">
          {evaluations.map((e) => (
            <button
              key={e.id}
              onClick={() => setDetailEvaluationId(e.id)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg transition-colors text-left"
            >
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold truncate">
                  {e.sequenceNo ? `${e.evaluationTypeName} ${e.sequenceNo}` : e.evaluationTypeName}
                </p>
                <p className="text-gray-500 text-xs mt-0.5">
                  {e.panelistCount} evaluator{e.panelistCount !== 1 ? 's' : ''}
                </p>
              </div>
              <span
                className={`text-sm font-bold px-2.5 py-1 rounded-lg border shrink-0 ${
                  e.finalMarksObtained !== null
                    ? 'text-gold bg-gold/10 border-gold/25'
                    : 'text-gray-500 bg-zinc-800 border-zinc-700'
                }`}
              >
                {e.finalMarksObtained !== null ? `${e.finalMarksObtained}/${e.maxMarksSnapshot}` : 'Not evaluated'}
              </span>
            </button>
          ))}
        </div>
      )}

      {detailEvaluationId && (
        <EvaluationDetailModal evaluationId={detailEvaluationId} onClose={() => setDetailEvaluationId(null)} />
      )}
    </div>
  );
}

// Task/Evaluation are inherently cohort-scoped, so this page is cohort-first:
// pick a cohort, then manage its evaluations — filter/search its students on
// the left, click one to see their evaluation status on the right. Mirrors
// ViewCohortPage's own list->detail split, just for a different slice of the
// same cohort (ViewCohortPage itself stays scoped to students/projects/mentors).
export default function AdminEvaluationTracker() {
  const { showError } = useToast();
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loadingCohorts, setLoadingCohorts] = useState(true);
  const [selectedCohort, setSelectedCohort] = useState<CohortDetails | null>(null);
  const [loadingCohortDetail, setLoadingCohortDetail] = useState(false);

  const [batchFilter, setBatchFilter] = useState('');
  const [trackFilter, setTrackFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const [studentsList, setStudentsList] = useState<ApiStudent[]>([]);
  const [listPage, setListPage] = useState(1);
  const [listLimit, setListLimit] = useState(20);
  const [listLoading, setListLoading] = useState(false);
  const [listPagination, setListPagination] = useState({ totalPages: 1, total: 0 });

  useEffect(() => {
    (async () => {
      try {
        setCohorts(await apiListCohorts());
      } catch (err: unknown) {
        showError(err instanceof Error ? err.message : 'Failed to load cohorts');
      } finally {
        setLoadingCohorts(false);
      }
    })();
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

  const backToCohorts = () => {
    setSelectedCohort(null);
    setBatchFilter('');
    setTrackFilter('');
    setSearch('');
    setSelectedStudentId(null);
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setListPage(1);
  }, [batchFilter, trackFilter, debouncedSearch, selectedCohort?.id]);

  useEffect(() => {
    if (!selectedCohort) return;
    let cancelled = false;
    setListLoading(true);
    (async () => {
      try {
        const res = await apiListStudentsPage({
          page: listPage,
          limit: listLimit,
          cohortId: selectedCohort.id,
          batch: batchFilter || undefined,
          track: trackFilter || undefined,
          search: debouncedSearch || undefined,
        });
        if (cancelled) return;
        setStudentsList(res.data);
        setListPagination({ totalPages: res.pagination.totalPages, total: res.pagination.total });
      } catch (err: unknown) {
        if (!cancelled) showError(err instanceof Error ? err.message : 'Failed to load students');
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCohort, listPage, listLimit, batchFilter, trackFilter, debouncedSearch, showError]);

  // Evaluations only make sense once teams are actually locked in and the
  // cohort is a live, running one — `allocationPublishedAt` (a sticky
  // one-way flag) is the source of truth for "ever published," not the
  // volatile `allocationRunStatus` enum, which can cycle back to draft/review
  // if new teams are added post-publish (see the allocations module).
  const isEvaluationEligible = !!selectedCohort?.isActive && !!selectedCohort?.allocationPublishedAt;

  const studentRows = studentsList.map((s) => ({
    id: s.id,
    name: s.fullName || s.email || s.id,
    batch: s.batch || '—',
  }));

  const selectedStudent = studentsList.find((s) => s.id === selectedStudentId) || null;

  return (
    <div className="space-y-4">
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
        <div className="space-y-3">
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
                <div className="flex flex-wrap items-center gap-3">
                  <Select
                    variant="filter"
                    className="min-w-[160px]"
                    value={batchFilter}
                    onChange={setBatchFilter}
                    placeholder="All Batches"
                    options={(selectedCohort.allowedBatches || []).map((b) => ({ value: b, label: b }))}
                  />
                  <Select
                    variant="filter"
                    className="min-w-[160px]"
                    value={trackFilter}
                    onChange={setTrackFilter}
                    placeholder="All Tracks"
                    options={TRACKS.map((t) => ({ value: t, label: t }))}
                  />
                </div>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 active:scale-95 transition-all duration-200 text-sm shadow-md shadow-gold/10"
                >
                  <Plus size={16} />
                  Add Evaluation
                </button>
              </div>

              <div className="flex flex-col lg:flex-row gap-4">
                <div className="lg:w-[420px] shrink-0 relative">
                  {listLoading && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 rounded-xl">
                      <SpinnerSquare size={32} />
                    </div>
                  )}
                  <DataTable
                    columns={[{ key: 'name', header: 'Name' }, { key: 'batch', header: 'Batch' }]}
                    data={studentRows}
                    searchPlaceholder="Search by name or roll number..."
                    onRowClick={(row) => setSelectedStudentId(row.id as string)}
                    onSearchChange={setSearch}
                    serverPagination={{
                      page: listPage,
                      limit: listLimit,
                      total: listPagination.total,
                      totalPages: listPagination.totalPages,
                      onPageChange: setListPage,
                      limitOptions: [20, 40, 80, 100],
                      onLimitChange: (value) => {
                        setListPage(1);
                        setListLimit(value);
                      },
                    }}
                  />
                </div>

                <div className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  {selectedStudent ? (
                    <StudentEvaluationDetail
                      student={selectedStudent}
                      cohortId={selectedCohort.id}
                      onBack={() => setSelectedStudentId(null)}
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center py-20 px-6">
                      <p className="text-gray-500 text-sm text-center">Select a student on the left to see their evaluation status.</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {showAddModal && selectedCohort && (
        <AddEvaluationModal
          cohortId={selectedCohort.id}
          cohortMentors={selectedCohort.mentors || []}
          onClose={() => setShowAddModal(false)}
          onCreated={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
