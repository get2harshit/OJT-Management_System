import PageLayout from '../../../components/PageLayout';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Award, Plus, Download, Table2 } from 'lucide-react';
import DataTable from '../../../components/DataTable';
import SpinnerSquare from '../../../components/SpinnerSquare';
import Select from '../../../components/Select';
import Drawer from '../../../components/Drawer';
import { AddEvaluationModal } from './AddEvaluationModal';
import type { CohortDetails, CohortEvaluationConfig, EvaluationMode } from '../../../lib/types';
import type { CohortEvaluationSummaryStudent, CohortEvaluationSummaryEvaluation } from '../../../lib/api/evaluations';
import { apiGetCohortEvaluationSummary } from '../../../lib/api/evaluations';
import { apiListCohortEvaluationConfigs } from '../../../lib/api/evaluations';
import { apiGetCohort } from '../../../lib/api';
import { getCohortLabel } from '../../../lib/cohortLabel';
import { exportToCSV } from '../../../lib/csvExport';
import { formatDateDisplay } from '../../../lib/utils';
import { useToast } from '../../../toast';
import { usePageRefresh } from '../../../context/RefreshContext';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

const MODE_LABELS: Record<EvaluationMode, string> = {
  upload: 'Upload',
  rubric: 'Rubric',
};

interface OptionalColumn {
  key: string;
  label: string;
  value: (s: CohortEvaluationSummaryStudent) => string;
}

const fmt = (v: number | null | undefined, max: number): string => (v != null ? `${v}/${max}` : '—');

export default function CohortEvaluationSummaryPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const navigate = useNavigate();
  const { showError } = useToast();

  // Fetched with the roster included so this same call also carries what the
  // configured-evaluations section below needs (isActive, allocationPublishedAt,
  // mentors for the Add Evaluation modal) — no second cohort fetch.
  const [cohort, setCohort] = useState<CohortDetails | null>(null);
  const cohortLabel = cohort ? getCohortLabel(cohort) : '';
  const allowedBatches = cohort?.allowedBatches ?? [];
  const [loading, setLoading] = useState(true);
  const [evaluations, setEvaluations] = useState<CohortEvaluationSummaryEvaluation[]>([]);

  // Evaluations only make sense once teams are actually locked in and the
  // cohort is a live, running one — `allocationPublishedAt` (a sticky
  // one-way flag) is the source of truth for "ever published," not the
  // volatile `allocationRunStatus` enum, which can cycle back to draft/review
  // if new teams are added post-publish (see the allocations module).
  const isEvaluationEligible = !!cohort?.isActive && !!cohort?.allocationPublishedAt;
  const [configs, setConfigs] = useState<CohortEvaluationConfig[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const [batchFilter, setBatchFilter] = useState('');
  // The search box belongs to DataTable now, so only the debounced value
  // that the fetch actually runs on is held here.
  const [search, setSearch] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Optional columns are built from the cohort's evaluations: three per
  // evaluation — Total (final), Internal (internal mentor's total) and
  // External (external mentor's total). Student Name/Batch/Track are always
  // shown outside this list.
  const availableColumns = useMemo<OptionalColumn[]>(() => {
    const cols: OptionalColumn[] = [
      { key: 'rollNumber', label: 'Roll Number', value: s => s.rollNumber || '—' },
    ];
    for (const ev of evaluations) {
      const id = ev.configId;
      cols.push({ key: `${id}:total`, label: `${ev.name} · Total`, value: s => fmt(s.marks[id]?.total, ev.maxMarks) });
      cols.push({ key: `${id}:int`, label: `${ev.name} · Internal`, value: s => fmt(s.marks[id]?.internal, ev.maxMarks) });
      cols.push({ key: `${id}:ext`, label: `${ev.name} · External`, value: s => fmt(s.marks[id]?.external, ev.maxMarks) });
    }
    return cols;
  }, [evaluations]);

  const [extraColumns, setExtraColumns] = useState<string[]>([]);
  const [columnsDrawerOpen, setColumnsDrawerOpen] = useState(false);
  const activeColumns = availableColumns.filter(c => extraColumns.includes(c.key));
  const toggleColumn = (key: string) => {
    setExtraColumns(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  };

  const [students, setStudents] = useState<CohortEvaluationSummaryStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });


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

  const fetchStudents = useCallback(async () => {
    if (!cohortId) return;
    setStudentsLoading(true);
    try {
      const res = await apiGetCohortEvaluationSummary(cohortId, {
        batch: batchFilter || undefined,
        search: search || undefined,
        page,
        limit,
      });
      setStudents(res.data);
      setPagination(res.pagination);
      setEvaluations(res.meta.evaluations);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load evaluation summary');
    } finally {
      setStudentsLoading(false);
    }
  }, [cohortId, batchFilter, search, page, limit, showError]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  usePageRefresh(useCallback(async () => {
    await Promise.all([fetchCohort(), fetchStudents(), loadConfigs()]);
  }, [fetchCohort, fetchStudents, loadConfigs]));

  const handleSearchInputChange = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleBatchFilterChange = (value: string) => {
    setBatchFilter(value);
    setPage(1);
  };

  const handleLimitChange = (value: number) => {
    setPage(1);
    setLimit(value);
  };

  const [exportingCsv, setExportingCsv] = useState(false);
  const handleExportCSV = async () => {
    if (!cohortId) return;
    setExportingCsv(true);
    try {
      const res = await apiGetCohortEvaluationSummary(cohortId, {
        batch: batchFilter || undefined,
        search: search || undefined,
        page: 1,
        limit: Math.max(pagination.total, 1),
      });
      const columns = [
        { key: 'fullName', header: 'Student Name' },
        { key: 'batch', header: 'Batch' },
        { key: 'track', header: 'Track' },
        ...activeColumns.map(c => ({ key: c.key, header: c.label })),
      ];
      const rows = res.data.map(s => {
        const row: Record<string, string> = {
          fullName: s.fullName || '',
          batch: s.batch || '',
          track: s.track || '',
        };
        for (const c of activeColumns) {
          row[c.key] = c.value(s);
        }
        return row;
      });
      exportToCSV(`evaluation_summary_${(cohortLabel || cohortId).replace(/\s+/g, '_')}`, rows, columns);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to export CSV');
    } finally {
      setExportingCsv(false);
    }
  };

  const configRows = configs.map((c) => ({
    id: c.id,
    evaluation: c.sequenceNo ? `${c.evaluationTypeTemplate.name} ${c.sequenceNo}` : c.evaluationTypeTemplate.name,
    mode: c.evaluationTypeTemplate.mode,
    maxMarks: c.maxMarksSnapshot,
    startDate: c.startDate,
    endDate: c.endDate,
    isActive: c.isActive,
  }));

  // Name/Batch/Track always, then whatever the admin added. Built from the
  // same AVAILABLE_COLUMNS entries the CSV export reads, so a column shows the
  // same thing on screen as in the file.
  const columns = useMemo(
    () => [
      {
        key: 'fullName',
        header: 'Student Name',
        render: (s: CohortEvaluationSummaryStudent) => (
          <span className="text-white font-medium whitespace-nowrap">{s.fullName || '\u2014'}</span>
        ),
      },
      { key: 'batch', header: 'Batch', render: (s: CohortEvaluationSummaryStudent) => s.batch || '\u2014' },
      { key: 'track', header: 'Track', render: (s: CohortEvaluationSummaryStudent) => s.track || '\u2014' },
      ...activeColumns.map(c => ({
        key: c.key,
        header: c.label,
        render: (s: CohortEvaluationSummaryStudent) => <span className="whitespace-nowrap">{c.value(s)}</span>,
      })),
    ],
    [activeColumns]
  );

  return (
    <PageLayout className="space-y-3">

      {loading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : (
        <>
        {!isEvaluationEligible ? (
          <div className="border border-dashed border-zinc-800 rounded-xl py-10 flex flex-col items-center justify-center gap-2 text-center px-6">
            <Award size={22} className="text-gray-600 mb-1" />
            <p className="text-gray-400 text-sm font-medium">Evaluation isn't available yet for this cohort.</p>
            <p className="text-gray-500 text-xs max-w-sm">
              Evaluations can only be set up once this cohort's team allocations are published and the cohort is running.
            </p>
          </div>
        ) : (
          <div className="space-y-3 border border-zinc-800 rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-white font-semibold text-sm">
                <Table2 size={16} className="text-gold" />
                Configured Evaluations
                <span className="text-gray-500 font-normal">
                  ({configs.length} set up)
                </span>
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors"
              >
                <Plus size={14} />
                Add Evaluation
              </button>
            </div>

            {loadingConfigs ? (
              <div className="flex justify-center py-8">
                <SpinnerSquare size={28} />
              </div>
            ) : configs.length === 0 ? (
              <p className="text-gray-500 text-xs py-4 text-center">No evaluations set up for this cohort yet — use “Add Evaluation” to create the first one.</p>
            ) : (
              <DataTable
                fill={false}
                columns={[
                  { key: 'evaluation', header: 'Evaluation' },
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
                ]}
                data={configRows}
                hideExport
                onRowClick={(row) => navigate(`/admin/dashboard/ojts/${cohortId}/evaluation/${row.id}`)}
              />
            )}
          </div>
        )}

        <DataTable<CohortEvaluationSummaryStudent>
          columns={columns}
          data={students}
          loading={studentsLoading}
          searchPlaceholder="Search by name or roll number..."
          onSearchChange={handleSearchInputChange}
          /* The table's own export writes the rows it currently holds, which
             here is one page. This page's button fetches the whole filtered
             set first, so it stays. */
          hideExport
          leftHeaderContent={
            <>
              {allowedBatches.length > 0 && (
                <Select
                  variant="filter"
                  value={batchFilter}
                  onChange={v => handleBatchFilterChange(v as string)}
                  options={allowedBatches.map(b => ({ value: b, label: b }))}
                  placeholder="All Batches"
                  className="min-w-[120px] !text-xs !py-1.5"
                />
              )}
              <span className="text-xs text-gray-500 shrink-0">
                {pagination.total} student{pagination.total === 1 ? '' : 's'}
              </span>
              <button
                onClick={handleExportCSV}
                disabled={exportingCsv || pagination.total === 0}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors shrink-0 disabled:opacity-50"
              >
                <Download size={13} />
                {exportingCsv ? 'Exporting...' : 'Export CSV'}
              </button>
              <button
                onClick={() => setColumnsDrawerOpen(true)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-zinc-850 border border-zinc-750 rounded-lg text-gray-300 hover:text-white hover:border-gold/40 transition-colors shrink-0"
              >
                <Plus size={13} />
                Customize Columns
              </button>
            </>
          }
          serverPagination={{
            page: pagination.page,
            limit: pagination.limit,
            totalPages: pagination.totalPages,
            total: pagination.total,
            onPageChange: setPage,
            onLimitChange: handleLimitChange,
          }}
        />
        </>
      )}


      <Drawer open={columnsDrawerOpen} onClose={() => setColumnsDrawerOpen(false)} title="Customize Columns" widthClassName="max-w-xs">
        <div className="space-y-0.5">
          {availableColumns.map(c => {
            const active = extraColumns.includes(c.key);
            return (
              <button
                key={c.key}
                onClick={() => toggleColumn(c.key)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left border-l-2 transition-colors ${
                  active
                    ? 'border-gold bg-gold/10 text-white font-medium'
                    : 'border-transparent text-gray-300 hover:bg-gold/5 hover:text-white hover:border-gold/30'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </Drawer>

      {showAddModal && cohortId && (
        <AddEvaluationModal
          cohortId={cohortId}
          cohortMentors={cohort?.mentors || []}
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false);
            loadConfigs();
          }}
        />
      )}
    </PageLayout>
  );
}
