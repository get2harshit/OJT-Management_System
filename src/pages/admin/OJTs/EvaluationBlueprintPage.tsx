import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Award, ArrowLeft, Search, Plus, Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
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
const LIMIT_OPTIONS = [20, 40, 80, 100, 500, 1000, 2000];

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
  const navigate = useNavigate();
  const { showError } = useToast();

  const [cohortLabel, setCohortLabel] = useState('');
  const [allowedBatches, setAllowedBatches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<EvaluationBlueprintMeta | null>(null);

  const [statusFilter, setStatusFilter] = useState<EvaluationBlueprintStatus | ''>('');
  const [batchFilter, setBatchFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
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

  // Fit the table body to the space below it so it scrolls internally instead
  // of pushing the footer/page past the viewport — same technique as the
  // allocation blueprint (see its comment for why `loading` is a dependency).
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const [maxTableHeight, setMaxTableHeight] = useState<number | undefined>(undefined);
  useEffect(() => {
    const computeMaxHeight = () => {
      const wrap = tableWrapRef.current;
      if (!wrap) return;
      const wrapTop = wrap.getBoundingClientRect().top;
      const footerHeight = footerRef.current?.getBoundingClientRect().height ?? 0;
      const paddingBottom = window.innerWidth >= 1024 ? 16 : 12;
      const available = window.innerHeight - wrapTop - footerHeight - paddingBottom;
      setMaxTableHeight(Math.max(200, Math.floor(available)));
    };
    computeMaxHeight();
    const rafId = requestAnimationFrame(computeMaxHeight);
    const timerId = setTimeout(computeMaxHeight, 100);
    window.addEventListener('resize', computeMaxHeight);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
      window.removeEventListener('resize', computeMaxHeight);
    };
  }, [loading, students.length, pagination.totalPages]);

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
    setSearchInput(value);
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

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-750 transition-colors shrink-0"
          title="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <Award className="text-gold shrink-0" size={16} />
        <h1 className="text-sm font-semibold text-white">
          {meta?.evaluationName ? `${meta.evaluationName} · Blueprint` : 'Evaluation Blueprint'}
        </h1>
        {cohortLabel && <span className="text-xs text-gray-500">— {cohortLabel}</span>}
      </div>

      {loading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-xs flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchInput}
                onChange={e => handleSearchInputChange(e.target.value)}
                placeholder="Search by name or roll number..."
                className="w-full bg-zinc-850 border border-zinc-750 rounded-lg pl-8 pr-3 py-1.5 text-white text-xs focus:outline-none focus:border-gold"
              />
            </div>
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
            <span className="text-xs text-gray-500 shrink-0">{pagination.total} student{pagination.total === 1 ? '' : 's'}</span>
            <button
              onClick={handleExportCSV}
              disabled={exportingCsv || pagination.total === 0}
              className="ml-auto flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors shrink-0 disabled:opacity-50"
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
          </div>

          <div className="bg-zinc-850 border border-zinc-750 rounded-xl overflow-hidden">
            <div
              ref={tableWrapRef}
              className="overflow-auto"
              style={maxTableHeight ? { maxHeight: maxTableHeight } : undefined}
            >
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-zinc-850">
                  <tr className="border-b border-zinc-750 text-left text-gray-400 text-xs uppercase tracking-wider">
                    <th className="px-4 py-3">Student Name</th>
                    <th className="px-4 py-3">Batch</th>
                    <th className="px-4 py-3">Status</th>
                    {activeColumns.map(c => (
                      <th key={c.key} className="px-4 py-3 whitespace-nowrap">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {studentsLoading ? (
                    <tr>
                      <td colSpan={3 + activeColumns.length} className="p-6">
                        <div className="flex justify-center"><SpinnerSquare size={28} /></div>
                      </td>
                    </tr>
                  ) : students.length === 0 ? (
                    <tr>
                      <td colSpan={3 + activeColumns.length} className="p-8 text-center text-gray-500">No students match these filters.</td>
                    </tr>
                  ) : (
                    students.map(s => (
                      <tr key={s.studentId} className="border-b border-zinc-800 last:border-0">
                        <td className="px-4 py-3 text-white font-medium whitespace-nowrap">{s.fullName || '—'}</td>
                        <td className="px-4 py-3 text-gray-300">{s.batch || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${STATUS_TEXT[s.status]}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s.status]}`} />
                            {STATUS_LABELS[s.status]}
                          </span>
                        </td>
                        {activeColumns.map(c => (
                          <td key={c.key} className="px-4 py-3 text-gray-300 whitespace-nowrap">{c.value(s)}</td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {!studentsLoading && pagination.total > 0 && (
              <div ref={footerRef} className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-zinc-750 flex-wrap">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    {(pagination.page - 1) * pagination.limit + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                  </span>
                  <div className="flex items-center gap-1">
                    {LIMIT_OPTIONS.map(opt => (
                      <button
                        key={opt}
                        onClick={() => handleLimitChange(opt)}
                        className={`text-xs px-2 py-1 rounded-md transition-colors ${
                          opt === limit ? 'bg-gold/20 text-gold font-semibold' : 'text-gray-400 hover:text-white hover:bg-zinc-750'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                {pagination.totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(1)}
                      disabled={page === 1}
                      className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-zinc-750 disabled:opacity-30 transition-colors"
                    >
                      <ChevronsLeft size={16} />
                    </button>
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-zinc-750 disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-sm text-gray-400">{pagination.page} / {pagination.totalPages}</span>
                    <button
                      onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                      disabled={page === pagination.totalPages}
                      className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-zinc-750 disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <button
                      onClick={() => setPage(pagination.totalPages)}
                      disabled={page === pagination.totalPages}
                      className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-zinc-750 disabled:opacity-30 transition-colors"
                    >
                      <ChevronsRight size={16} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
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
