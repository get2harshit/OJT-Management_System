import PageLayout from '../../../components/PageLayout';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Table2, Download, Plus } from 'lucide-react';
import DataTable from '../../../components/DataTable';
import CohortPageHeader from './CohortPageHeader';
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
  // Shown as a hover tooltip on the column header instead of in the label
  // itself — used for a per-viva column's full scope ("Viva 1 · Product
  // Development"), which is too long to repeat as visible header text.
  title?: string;
}

const fmt = (v: number | null | undefined, max: number): string => (v != null ? `${v}/${max}` : '—');

// The cohort-wide "who scored what" table, split out of
// CohortEvaluationSummaryPage into its own route — it's a heavy,
// server-paginated student-by-student breakdown, not something that
// belongs sitting under the (much lighter) Configured Evaluations list on
// every visit. Reached via that page's "View Reports" button, same pattern
// as EvaluationBlueprintPage / AllocationBlueprintPage / CohortOpsPage.
export default function CohortEvaluationReportsPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const { showError } = useToast();

  const [cohortLabel, setCohortLabel] = useState('');
  const [allowedBatches, setAllowedBatches] = useState<string[]>([]);
  const [evaluations, setEvaluations] = useState<CohortEvaluationSummaryEvaluation[]>([]);

  const [batchFilter, setBatchFilter] = useState('');
  // The search box belongs to DataTable now, so only the debounced value
  // that the fetch actually runs on is held here.
  const [search, setSearch] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Per-viva marks — Primary and Secondary(s) columns for EVERY configured
  // evaluation, always on. Raw panelist marks, not the derived Total/Average
  // composite (best-of or panel-averaged) — an admin/ops reader wants to see
  // who scored what, not a blended number. The full criterion-by-criterion
  // rubric breakdown lives on that evaluation's own Blueprint page
  // (EvaluationBlueprintPage, one config at a time) — this page stays a
  // cross-cohort scan, not another place to drill into a rubric.
  const secondaryTotals = (s: CohortEvaluationSummaryStudent, id: string) => {
    const panelists = s.marks[id]?.secondaryPanelists ?? [];
    return panelists.length > 0 ? panelists.map(p => (p.totalMarks != null ? String(p.totalMarks) : '—')).join(', ') : '—';
  };
  const fixedPerVivaColumns = useMemo<OptionalColumn[]>(() => {
    // Column headers use shortName ("Viva 1"), not the full disambiguated
    // name — a cohort where two configs share a type + sequence but differ
    // in scope (e.g. two separately-scoped "Viva 1" rounds) would otherwise
    // repeat that whole scope string across headers. The full name still
    // shows on hover; duplicates additionally get a "(2)", "(3)" suffix so
    // two headers are never literally identical.
    const shortNameCounts = new Map<string, number>();
    for (const ev of evaluations) shortNameCounts.set(ev.shortName, (shortNameCounts.get(ev.shortName) ?? 0) + 1);
    const seenSoFar = new Map<string, number>();
    const cols: OptionalColumn[] = [];
    for (const ev of evaluations) {
      const id = ev.configId;
      let label = ev.shortName;
      if ((shortNameCounts.get(ev.shortName) ?? 0) > 1) {
        const n = (seenSoFar.get(ev.shortName) ?? 0) + 1;
        seenSoFar.set(ev.shortName, n);
        label = `${ev.shortName} (${n})`;
      }
      cols.push({ key: `${id}:primary`, label: `${label} · Primary`, title: ev.name, value: s => fmt(s.marks[id]?.primary, ev.maxMarks) });
      cols.push({ key: `${id}:secondary`, label: `${label} · Secondary(s)`, title: ev.name, value: s => secondaryTotals(s, id) });
    }
    return cols;
  }, [evaluations]);

  // Overall — every viva combined into one figure: what was available
  // (Max), what was actually obtained (Avg), and the percentage that's
  // derived from. Only scored evaluations count toward either half, so an
  // OJT with vivas still ahead doesn't read as a student failing most of
  // it — see overallMarks in the backend's evaluationScoring.ts.
  const fixedOverallColumns = useMemo<OptionalColumn[]>(
    () => [
      { key: 'overallMax', label: 'Overall Max', value: s => (s.overallMaxMarks != null ? String(s.overallMaxMarks) : '—') },
      { key: 'overallAvg', label: 'Overall Avg', value: s => (s.overallObtained != null ? String(s.overallObtained) : '—') },
      { key: 'overallPercent', label: 'Overall Percent', value: s => (s.overallPercentage != null ? `${s.overallPercentage}%` : '—') },
    ],
    []
  );

  // The one remaining optional column — everything else now has a fixed
  // home, either right on this page (per-viva Primary/Secondary, Overall) or
  // on the evaluation's own Blueprint page (full rubric breakdown).
  const availableColumns = useMemo<OptionalColumn[]>(
    () => [{ key: 'rollNumber', label: 'Roll Number', value: s => s.rollNumber || '—' }],
    []
  );

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
    try {
      const cohort = await apiGetCohort(cohortId);
      setCohortLabel(getCohortLabel(cohort));
      setAllowedBatches(cohort.allowedBatches ?? []);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load cohort');
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
        ...fixedPerVivaColumns.map(c => ({ key: c.key, header: c.label })),
        ...fixedOverallColumns.map(c => ({ key: c.key, header: c.label })),
        ...activeColumns.map(c => ({ key: c.key, header: c.label })),
      ];
      const rows = res.data.map(s => {
        const row: Record<string, string> = {
          fullName: s.fullName || '',
          batch: s.batch || '',
          track: s.track || '',
        };
        for (const c of fixedPerVivaColumns) {
          row[c.key] = c.value(s);
        }
        for (const c of fixedOverallColumns) {
          row[c.key] = c.value(s);
        }
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

  // Name/Batch/Track, then every viva's Primary/Secondary marks, then the
  // Overall Max/Avg/Percent — the headline numbers a report exists to show,
  // so always on — then whatever drill-down columns the admin added from
  // Customize Columns. Built from the same column definitions the CSV
  // export reads, so a column shows the same thing on screen as in the file.
  const columns = useMemo(
    () => [
      {
        key: 'fullName',
        header: 'Student Name',
        render: (s: CohortEvaluationSummaryStudent) => (
          <span className="text-white font-medium whitespace-nowrap">{s.fullName || '—'}</span>
        ),
      },
      { key: 'batch', header: 'Batch', render: (s: CohortEvaluationSummaryStudent) => s.batch || '—' },
      { key: 'track', header: 'Track', render: (s: CohortEvaluationSummaryStudent) => s.track || '—' },
      ...fixedPerVivaColumns.map(c => ({
        key: c.key,
        header: c.label,
        // Full scope on hover instead of in the visible header text — see
        // fixedPerVivaColumns above for why.
        headerRender: () => <span title={c.title}>{c.label}</span>,
        render: (s: CohortEvaluationSummaryStudent) => <span className="whitespace-nowrap">{c.value(s)}</span>,
      })),
      ...fixedOverallColumns.map(c => ({
        key: c.key,
        header: c.label,
        render: (s: CohortEvaluationSummaryStudent) => (
          <span className="text-gold font-semibold whitespace-nowrap">{c.value(s)}</span>
        ),
      })),
      ...activeColumns.map(c => ({
        key: c.key,
        header: c.label,
        render: (s: CohortEvaluationSummaryStudent) => <span className="whitespace-nowrap">{c.value(s)}</span>,
      })),
    ],
    [fixedPerVivaColumns, fixedOverallColumns, activeColumns]
  );

  return (
    <PageLayout className="space-y-3">
      <CohortPageHeader title="Evaluation Reports" subtitle={cohortLabel || undefined} icon={Table2} />

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
    </PageLayout>
  );
}
