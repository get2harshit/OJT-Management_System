import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Table2, Plus, Download } from 'lucide-react';
import DataTable from '../../../components/DataTable';
import CohortPageHeader from './CohortPageHeader';
import SpinnerSquare from '../../../components/SpinnerSquare';
import Select from '../../../components/Select';
import Drawer from '../../../components/Drawer';
import type { CohortEvaluationSummaryStudent, CohortEvaluationSummaryEvaluation } from '../../../lib/api/evaluations';
import { apiGetCohortEvaluationSummary } from '../../../lib/api/evaluations';
import { apiGetCohort } from '../../../lib/api';
import { getCohortLabel } from '../../../lib/cohortLabel';
import { exportToCSV } from '../../../lib/csvExport';
import { useToast } from '../../../toast';
import { usePageRefresh } from '../../../context/RefreshContext';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

interface OptionalColumn {
  key: string;
  label: string;
  value: (s: CohortEvaluationSummaryStudent) => string;
}

const fmt = (v: number | null | undefined, max: number): string => (v != null ? `${v}/${max}` : '—');

export default function CohortEvaluationSummaryPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const { showError } = useToast();

  const [cohortLabel, setCohortLabel] = useState('');
  const [allowedBatches, setAllowedBatches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluations, setEvaluations] = useState<CohortEvaluationSummaryEvaluation[]>([]);

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
      const cohort = await apiGetCohort(cohortId);
      setCohortLabel(getCohortLabel(cohort));
      setAllowedBatches(cohort.allowedBatches ?? []);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load cohort');
    } finally {
      setLoading(false);
    }
  }, [cohortId, showError]);

  useEffect(() => {
    fetchCohort();
  }, [fetchCohort]);

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
    await Promise.all([fetchCohort(), fetchStudents()]);
  }, [fetchCohort, fetchStudents]));

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
    <div className="space-y-3">
      <CohortPageHeader title="Evaluation Summary" subtitle={cohortLabel || undefined} icon={Table2} />

      {loading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : (
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
            autoFit: true,
          }}
        />
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
    </div>
  );
}
