import PageLayout from '../../../components/PageLayout';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Award, Plus, Download } from 'lucide-react';
import DataTable from '../../../components/DataTable';
import CohortPageHeader from './CohortPageHeader';
import SpinnerSquare from '../../../components/SpinnerSquare';
import Select from '../../../components/Select';
import Drawer from '../../../components/Drawer';
import type { EvaluationBlueprintStatus, EvaluationBlueprintStudent, EvaluationBlueprintMeta } from '../../../lib/api/evaluations';
import { apiGetEvaluationBlueprint } from '../../../lib/api/evaluations';
import { apiGetCohort } from '../../../lib/api';
import { getCohortLabel } from '../../../lib/cohortLabel';
import { exportToCSV } from '../../../lib/csvExport';
import { useToast } from '../../../toast';
import { usePageRefresh } from '../../../context/RefreshContext';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

const STATUS_ORDER: EvaluationBlueprintStatus[] = ['not_assigned', 'pending', 'evaluated'];

const STATUS_LABELS: Record<EvaluationBlueprintStatus, string> = {
  not_assigned: 'Not assigned',
  pending: 'Pending',
  evaluated: 'Evaluated',
};

// App status-color convention — gray=not started, yellow=waiting/in progress,
// green=done (matches the allocation blueprint / submissions coloring).
const STATUS_DOT: Record<EvaluationBlueprintStatus, string> = {
  not_assigned: 'bg-gray-400',
  pending: 'bg-yellow-500',
  evaluated: 'bg-green-500',
};

const STATUS_TEXT: Record<EvaluationBlueprintStatus, string> = {
  not_assigned: 'text-gray-400',
  pending: 'text-yellow-500',
  evaluated: 'text-green-500',
};

// A toggleable extra column. value() returns a plain string so the same
// definition drives both the on-screen cell and the CSV export.
interface OptionalColumn {
  key: string;
  label: string;
  value: (s: EvaluationBlueprintStudent) => string;
}

export default function EvaluationBlueprintPage() {
  const { cohortId, configId } = useParams<{ cohortId: string; configId: string }>();
  const { showError } = useToast();

  const [cohortLabel, setCohortLabel] = useState('');
  const [allowedBatches, setAllowedBatches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<EvaluationBlueprintMeta | null>(null);

  const [statusFilter, setStatusFilter] = useState<EvaluationBlueprintStatus | ''>('');
  const [batchFilter, setBatchFilter] = useState('');
  // The search box belongs to DataTable now, so only the debounced value
  // that the fetch actually runs on is held here.
  const [search, setSearch] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Optional columns are built from the evaluation's own rubric: the fixed
  // summary set (roll/track/mentors/totals/final) plus one Internal and one
  // External column PER criterion. Rebuilt whenever meta (hence the criteria)
  // changes; Student Name/Batch/Status are always shown outside this list.
  const availableColumns = useMemo<OptionalColumn[]>(() => {
    const cols: OptionalColumn[] = [
      { key: 'rollNumber', label: 'Roll Number', value: s => s.rollNumber || '—' },
      { key: 'track', label: 'Track', value: s => s.track || '—' },
      { key: 'internalMentor', label: 'Internal Mentor', value: s => s.internalMentorName || '—' },
      { key: 'externalMentor', label: 'External Mentor', value: s => s.externalMentorName || '—' },
      { key: 'internalTotal', label: 'Internal Total', value: s => (s.internalTotal != null ? String(s.internalTotal) : '—') },
      { key: 'externalTotal', label: 'External Total', value: s => (s.externalTotal != null ? String(s.externalTotal) : '—') },
      { key: 'finalMarks', label: 'Final Marks', value: s => (s.finalMarks != null ? `${s.finalMarks}/${meta?.maxMarks ?? '?'}` : '—') },
    ];
    for (const c of meta?.criteria ?? []) {
      const name = c.name;
      cols.push({
        key: `int::${name}`,
        label: `${name} · Int`,
        value: s => (s.internalScores?.[name] != null ? String(s.internalScores[name]) : '—'),
      });
      cols.push({
        key: `ext::${name}`,
        label: `${name} · Ext`,
        value: s => (s.externalScores?.[name] != null ? String(s.externalScores[name]) : '—'),
      });
    }
    return cols;
  }, [meta]);

  const [extraColumns, setExtraColumns] = useState<string[]>([]);
  const [columnsDrawerOpen, setColumnsDrawerOpen] = useState(false);
  const activeColumns = availableColumns.filter(c => extraColumns.includes(c.key));
  const toggleColumn = (key: string) => {
    setExtraColumns(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  };

  const [students, setStudents] = useState<EvaluationBlueprintStudent[]>([]);
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
    if (!configId) return;
    setStudentsLoading(true);
    try {
      const res = await apiGetEvaluationBlueprint(configId, {
        status: statusFilter || undefined,
        batch: batchFilter || undefined,
        search: search || undefined,
        page,
        limit,
      });
      setStudents(res.data);
      setPagination(res.pagination);
      setMeta(res.meta);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load evaluation');
    } finally {
      setStudentsLoading(false);
    }
  }, [configId, statusFilter, batchFilter, search, page, limit, showError]);

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

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value as EvaluationBlueprintStatus | '');
    setPage(1);
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
    if (!configId) return;
    setExportingCsv(true);
    try {
      // One request sized to the full matching count so the export has every
      // matching row, not just the on-screen page.
      const res = await apiGetEvaluationBlueprint(configId, {
        status: statusFilter || undefined,
        batch: batchFilter || undefined,
        search: search || undefined,
        page: 1,
        limit: Math.max(pagination.total, 1),
      });
      const columns = [
        { key: 'fullName', header: 'Student Name' },
        { key: 'batch', header: 'Batch' },
        { key: 'status', header: 'Status' },
        ...activeColumns.map(c => ({ key: c.key, header: c.label })),
      ];
      const rows = res.data.map(s => {
        const row: Record<string, string> = {
          fullName: s.fullName || '',
          batch: s.batch || '',
          status: STATUS_LABELS[s.status],
        };
        for (const c of activeColumns) {
          row[c.key] = c.value(s);
        }
        return row;
      });
      const base = meta?.evaluationName ? `${meta.evaluationName}_${cohortLabel || cohortId}` : (cohortLabel || cohortId || 'evaluation');
      exportToCSV(`evaluation_${base.replace(/\s+/g, '_')}`, rows, columns);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to export CSV');
    } finally {
      setExportingCsv(false);
    }
  };

  // Name/Batch/Status always, then whatever the admin added. Built from the
  // same AVAILABLE_COLUMNS entries the CSV export reads, so a column shows the
  // same thing on screen as in the file.
  const columns = useMemo(
    () => [
      {
        key: 'fullName',
        header: 'Student Name',
        render: (s: EvaluationBlueprintStudent) => (
          <span className="text-white font-medium whitespace-nowrap">{s.fullName || '\u2014'}</span>
        ),
      },
      { key: 'batch', header: 'Batch', render: (s: EvaluationBlueprintStudent) => s.batch || '\u2014' },
      {
        key: 'status',
        header: 'Status',
        render: (s: EvaluationBlueprintStudent) => (
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${STATUS_TEXT[s.status]}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s.status]}`} />
            {STATUS_LABELS[s.status]}
          </span>
        ),
      },
      ...activeColumns.map(c => ({
        key: c.key,
        header: c.label,
        render: (s: EvaluationBlueprintStudent) => <span className="whitespace-nowrap">{c.value(s)}</span>,
      })),
    ],
    [activeColumns]
  );

  return (
    <PageLayout className="space-y-3">
      <CohortPageHeader
        title={meta?.evaluationName ? `${meta.evaluationName} \u00b7 Blueprint` : 'Evaluation Blueprint'}
        subtitle={cohortLabel || undefined}
        icon={Award}
      />

      {loading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : (
        <DataTable<EvaluationBlueprintStudent>
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
              <Select
                variant="filter"
                value={statusFilter}
                onChange={v => handleStatusFilterChange(v as string)}
                options={STATUS_ORDER.map(s => ({ value: s, label: STATUS_LABELS[s] }))}
                placeholder="All Statuses"
                className="min-w-[150px] !text-xs !py-1.5"
              />
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
    </PageLayout>
  );
}
