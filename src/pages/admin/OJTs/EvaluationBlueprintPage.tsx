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
import { AdminScoreCorrectionModal } from './AdminScoreCorrectionModal';
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
  /**
   * Free text rather than a number or a name. Every other column is a few
   * characters and renders nowrap; a panelist's feedback runs to 4000, and
   * nowrap on that stretches the whole table sideways. Marked columns get a
   * clamped cell with the full text on hover — the CSV export reads `value`
   * directly, so the file still carries all of it.
   */
  longText?: boolean;
}

export default function EvaluationBlueprintPage() {
  const { cohortId, configId } = useParams<{ cohortId: string; configId: string }>();
  const { showError } = useToast();

  const [cohortLabel, setCohortLabel] = useState('');
  const [allowedBatches, setAllowedBatches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<EvaluationBlueprintMeta | null>(null);
  const [correctingEvaluationId, setCorrectingEvaluationId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<EvaluationBlueprintStatus | ''>('');
  const [batchFilter, setBatchFilter] = useState('');
  // The search box belongs to DataTable now, so only the debounced value
  // that the fetch actually runs on is held here.
  const [search, setSearch] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // A config can now declare more than one secondary panelist, so every
  // secondary-facing column joins each panelist's own value with a comma
  // instead of assuming there's exactly one.
  const secondaryNames = (s: EvaluationBlueprintStudent) =>
    s.secondaryPanelists.length > 0 ? s.secondaryPanelists.map(p => p.evaluatorName || 'Unknown').join(', ') : '—';
  const secondaryTotals = (s: EvaluationBlueprintStudent) =>
    s.secondaryPanelists.length > 0
      ? s.secondaryPanelists.map(p => (p.totalMarks != null ? String(p.totalMarks) : '—')).join(', ')
      : '—';

  // Named, and joined on a pipe rather than a comma: two panelists' notes run
  // into each other otherwise, and with prose there is no way to tell where one
  // ends — unlike secondaryTotals above, where each value is a single number.
  const secondaryFeedback = (s: EvaluationBlueprintStudent) => {
    const written = s.secondaryPanelists.filter(p => p.feedback?.trim());
    if (written.length === 0) return '—';
    return written.map(p => `${p.evaluatorName ?? 'Secondary'}: ${p.feedback!.trim()}`).join(' | ');
  };

  // Optional columns are built from the evaluation's own rubric: the fixed
  // summary set (roll/track/mentors/totals/final/average/%) plus one
  // Primary and one Secondary column PER criterion. Rebuilt whenever meta
  // (hence the criteria) changes; Student Name/Batch/Status are always
  // shown outside this list. Secondary-facing columns are left out
  // entirely when this config declares zero secondary panelists — every
  // row would just read "—", so there's nothing for them to show.
  const hasSecondaries = (meta?.secondaryEvaluatorCount ?? 0) > 0;
  const availableColumns = useMemo<OptionalColumn[]>(() => {
    const cols: OptionalColumn[] = [
      { key: 'rollNumber', label: 'Roll Number', value: s => s.rollNumber || '—' },
      { key: 'track', label: 'Track', value: s => s.track || '—' },
      { key: 'primaryMentor', label: 'Primary Mentor', value: s => s.primaryMentorName || '—' },
      ...(hasSecondaries ? [{ key: 'secondaryMentor', label: 'Secondary Mentor(s)', value: secondaryNames }] : []),
      { key: 'primaryTotal', label: 'Primary Total', value: s => (s.primaryTotal != null ? String(s.primaryTotal) : '—') },
      ...(hasSecondaries ? [{ key: 'secondaryTotal', label: 'Secondary Total(s)', value: secondaryTotals }] : []),
      { key: 'primaryFeedback', label: 'Primary Feedback', value: s => s.primaryFeedback?.trim() || '—', longText: true },
      ...(hasSecondaries
        ? [{ key: 'secondaryFeedback', label: 'Secondary Feedback(s)', value: secondaryFeedback, longText: true }]
        : []),
      { key: 'finalMarks', label: 'Final Marks', value: s => (s.finalMarks != null ? String(s.finalMarks) : '—') },
      { key: 'finalPercentage', label: 'Final %', value: s => (s.finalPercentage != null ? `${s.finalPercentage}%` : '—') },
      { key: 'averageMarks', label: 'Average Marks', value: s => (s.averageMarks != null ? String(s.averageMarks) : '—') },
    ];
    for (const c of meta?.criteria ?? []) {
      const name = c.name;
      cols.push({
        key: `prim::${name}`,
        label: `${name} · Primary`,
        value: s => (s.primaryScores?.[name] != null ? String(s.primaryScores[name]) : '—'),
      });
      if (hasSecondaries) {
        cols.push({
          key: `sec::${name}`,
          label: `${name} · Secondary`,
          value: s =>
            s.secondaryPanelists.length > 0
              ? s.secondaryPanelists.map(p => (p.scoreBreakdown?.[name] != null ? String(p.scoreBreakdown[name]) : '—')).join(', ')
              : '—',
        });
      }
    }
    return cols;
  }, [meta, hasSecondaries]);

  const [extraColumns, setExtraColumns] = useState<string[]>([]);
  const [columnsDrawerOpen, setColumnsDrawerOpen] = useState(false);
  const activeColumns = availableColumns.filter(c => extraColumns.includes(c.key));
  const toggleColumn = (key: string) => {
    setExtraColumns(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  };
  const allColumnsSelected = availableColumns.length > 0 && availableColumns.every(c => extraColumns.includes(c.key));
  const toggleSelectAllColumns = () => {
    setExtraColumns(allColumnsSelected ? [] : availableColumns.map(c => c.key));
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
        render: (s: EvaluationBlueprintStudent) => {
          const text = c.value(s);
          if (!c.longText) return <span className="whitespace-nowrap">{text}</span>;
          // title, so the whole note is still readable on hover without
          // leaving the table — and the row stays one line high.
          return (
            <span className="block max-w-[22rem] truncate" title={text === '—' ? undefined : text}>
              {text}
            </span>
          );
        },
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
        trailing={
          meta && (
            <span className="flex items-baseline gap-1.5 ml-1">
              <span className="text-base font-semibold tabular-nums leading-none text-gold">{meta.maxMarks}</span>
              <span className="text-xs text-gray-500 leading-none">Max Marks</span>
            </span>
          )
        }
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
          // Nothing to correct on a 'not_assigned' row — no evaluation
          // exists yet to open.
          onRowClick={(row) => {
            if (row.evaluationId) setCorrectingEvaluationId(row.evaluationId);
          }}
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
        <label className="w-full flex items-center gap-2.5 px-2.5 py-2 mb-1 rounded-lg text-sm cursor-pointer text-gray-300 hover:text-white border-b border-zinc-800">
          <input
            type="checkbox"
            checked={allColumnsSelected}
            onChange={toggleSelectAllColumns}
            className="rounded bg-zinc-750 border-zinc-650 accent-gold focus:ring-gold cursor-pointer"
          />
          Select all
        </label>
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

      {correctingEvaluationId && (
        <AdminScoreCorrectionModal
          evaluationId={correctingEvaluationId}
          onClose={() => setCorrectingEvaluationId(null)}
          onUpdated={fetchStudents}
        />
      )}
    </PageLayout>
  );
}
