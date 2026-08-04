import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LayoutGrid, ArrowLeft, Search, Plus, Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import SpinnerSquare from '../../../components/SpinnerSquare';
import Select from '../../../components/Select';
import Drawer from '../../../components/Drawer';
import type { AllocationBlueprintCounts, AllocationBlueprintStage, AllocationBlueprintStudent, AllocationBlueprintSummary } from '../../../lib/api/allocations';
import { apiGetCohort, apiGetAllocationBlueprint, apiGetAllocationBlueprintStudents } from '../../../lib/api';
import { getCohortLabel } from '../../../lib/cohortLabel';
import { exportToCSV } from '../../../lib/csvExport';
import { useToast } from '../../../toast';
import { usePageRefresh } from '../../../context/RefreshContext';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;
const LIMIT_OPTIONS = [20, 40, 80, 100, 500, 1000, 2000];

// Lifecycle order — this is the sequence a student actually moves through.
const STAGE_ORDER: AllocationBlueprintStage[] = [
  'no_team',
  'team_no_preferences',
  'preferences_pending_allocation',
  'allocated_not_published',
  'allocated_published',
];

const STAGE_LABELS: Record<AllocationBlueprintStage, string> = {
  no_team: 'No team yet',
  team_no_preferences: 'Team formed, no project picked',
  preferences_pending_allocation: 'Preferences submitted, allocation pending',
  allocated_not_published: 'Allocated, not published yet',
  allocated_published: 'Allocated & published',
};

// Matches the status-color convention already established elsewhere in the
// app (CohortAllocationsPage's RUN_STATUS_DOT/STATUS_DOT, Submissions'
// PENDING/ACCEPTED/RETURNED) — red=needs attention, gray=neutral/in progress,
// yellow=waiting on something, blue=resolved internally but not published
// yet (same as "draft"), green=done/published.
const STAGE_DOT: Record<AllocationBlueprintStage, string> = {
  no_team: 'bg-red-400',
  team_no_preferences: 'bg-gray-400',
  preferences_pending_allocation: 'bg-yellow-500',
  allocated_not_published: 'bg-blue-400',
  allocated_published: 'bg-green-500',
};

// The headline numbers beside the page title, in lifecycle order.
//
// The unit is spelled out in every label rather than left implied, because
// three of these count teams and one counts students — "1 team" next to a bare
// "487" would read as 487 of the same thing. They are counted on the server;
// nothing here derives a number from the table's own rows, which would only
// ever describe the page currently loaded.
const SUMMARY_ITEMS: { key: keyof AllocationBlueprintSummary; label: string; tone: string }[] = [
  { key: 'notYetStarted', label: 'students not started', tone: 'text-red-400' },
  { key: 'teamsFormed', label: 'teams formed', tone: 'text-gray-300' },
  { key: 'projectsSubmitted', label: 'teams picked a project', tone: 'text-yellow-500' },
  { key: 'allocationDone', label: 'teams allocated', tone: 'text-green-500' },
];

const STAGE_TEXT: Record<AllocationBlueprintStage, string> = {
  no_team: 'text-red-400',
  team_no_preferences: 'text-gray-400',
  preferences_pending_allocation: 'text-yellow-500',
  allocated_not_published: 'text-blue-400',
  allocated_published: 'text-green-500',
};

// Optional columns beyond the always-shown Student Name/Batch/Status — the
// admin picks which of these to add via the "Add Column" drawer. Kept as a
// fixed, ordered list (not the toggle-order the admin clicked in) so the
// table's column order stays stable regardless of the order things were
// turned on/off.
interface OptionalColumn {
  key: string;
  label: string;
  // Plain string, not JSX — shared as-is between the table cell and the CSV
  // export, so there's only one place defining what each column shows.
  value: (s: AllocationBlueprintStudent) => string;
}

const AVAILABLE_COLUMNS: OptionalColumn[] = [
  { key: 'rollNumber', label: 'Roll Number', value: s => s.rollNumber || '—' },
  { key: 'team', label: 'Team', value: s => s.teamName || '—' },
  { key: 'track', label: 'Track', value: s => s.track || '—' },
  { key: 'pref1Project', label: 'Preference 1 (Project)', value: s => s.pref1Project || '—' },
  { key: 'pref2Project', label: 'Preference 2 (Project)', value: s => s.pref2Project || '—' },
  { key: 'allocatedProject', label: 'Allocated Project', value: s => s.allocatedProject || '—' },
  { key: 'pref1Mentor', label: 'Preference 1 Mentor', value: s => s.pref1Mentor || '—' },
  { key: 'pref2Mentor', label: 'Preference 2 Mentor', value: s => s.pref2Mentor || '—' },
  { key: 'allocatedMentor', label: 'Allocated Mentor', value: s => s.allocatedMentor || '—' },
];

export default function AllocationBlueprintPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const navigate = useNavigate();
  const { showError } = useToast();

  const [cohortLabel, setCohortLabel] = useState('');
  const [allowedBatches, setAllowedBatches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<AllocationBlueprintCounts | null>(null);
  const [summary, setSummary] = useState<AllocationBlueprintSummary | null>(null);

  const [stageFilter, setStageFilter] = useState<AllocationBlueprintStage | ''>('');
  const [batchFilter, setBatchFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Name/Batch/Status are always shown — everything in AVAILABLE_COLUMNS is
  // an optional extra the admin adds via the "Add Column" drawer, off by
  // default to keep the table lean.
  const [extraColumns, setExtraColumns] = useState<string[]>([]);
  const [columnsDrawerOpen, setColumnsDrawerOpen] = useState(false);
  const activeColumns = AVAILABLE_COLUMNS.filter(c => extraColumns.includes(c.key));
  const toggleColumn = (key: string) => {
    setExtraColumns(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  };

  const [students, setStudents] = useState<AllocationBlueprintStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });

  // Sizes the table body to fill the space actually available below it — same
  // technique as DataTable's own handleFitToViewport — so the table scrolls
  // internally instead of pushing the pagination footer (or the page itself)
  // past the viewport. paddingBottom accounts for AppShell's <main> element's
  // own bottom padding (p-4/sm:p-6/lg:p-8), which window.innerHeight alone
  // doesn't know about. The rAF + delayed recompute catch the footer's real
  // height once it actually renders (it's conditional on totalPages > 1, so
  // the very first synchronous measurement can undercount it as 0).
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
    // `loading` (the overview fetch) and `studentsLoading`/students.length
    // (the students fetch) are two independent parallel requests — whichever
    // resolves second is what actually mounts the table into the DOM. Without
    // `loading` here, a run that finishes while the table isn't mounted yet
    // (tableWrapRef.current still null) permanently no-ops, since neither
    // students.length nor pagination.totalPages necessarily change again
    // afterward to trigger a re-run.
  }, [loading, students.length, pagination.totalPages]);

  const fetchOverview = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    try {
      const [cohort, data] = await Promise.all([
        apiGetCohort(cohortId),
        apiGetAllocationBlueprint(cohortId),
      ]);
      setCohortLabel(getCohortLabel(cohort));
      setAllowedBatches(cohort.allowedBatches ?? []);
      setCounts(data.stages);
      setSummary(data.summary);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load allocation blueprint');
    } finally {
      setLoading(false);
    }
  }, [cohortId, showError]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const fetchStudents = useCallback(async () => {
    if (!cohortId) return;
    setStudentsLoading(true);
    try {
      const res = await apiGetAllocationBlueprintStudents(cohortId, {
        stage: stageFilter || undefined,
        batch: batchFilter || undefined,
        search: search || undefined,
        page,
        limit,
      });
      setStudents(res.data);
      setPagination(res.pagination);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load students');
    } finally {
      setStudentsLoading(false);
    }
  }, [cohortId, stageFilter, batchFilter, search, page, limit, showError]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  usePageRefresh(useCallback(async () => {
    await Promise.all([fetchOverview(), fetchStudents()]);
  }, [fetchOverview, fetchStudents]));

  const handleSearchInputChange = (value: string) => {
    setSearchInput(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleStageFilterChange = (value: string) => {
    setStageFilter(value as AllocationBlueprintStage | '');
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
    if (!cohortId) return;
    setExportingCsv(true);
    try {
      // A dedicated fetch sized to the full matching count — one request,
      // not the on-screen page/limit — so the export always has everything
      // currently matching the filters, not just what's visible on screen.
      const res = await apiGetAllocationBlueprintStudents(cohortId, {
        stage: stageFilter || undefined,
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
          status: STAGE_LABELS[s.stage],
        };
        for (const c of activeColumns) {
          row[c.key] = c.value(s);
        }
        return row;
      });
      const filename = `allocation_blueprint_${(cohortLabel || cohortId).replace(/\s+/g, '_')}`;
      exportToCSV(filename, rows, columns);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to export CSV');
    } finally {
      setExportingCsv(false);
    }
  };

  const total = counts ? STAGE_ORDER.reduce((sum, s) => sum + counts[s], 0) : 0;

  return (
    <div className="space-y-3">
      {/* flex-wrap so the summary numbers drop to their own line on a narrow
          screen instead of squeezing the title — the title is what tells you
          which page you're on, so it is the last thing that should give way. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-750 transition-colors shrink-0"
          title="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <LayoutGrid className="text-gold shrink-0" size={16} />
        <h1 className="text-sm font-semibold text-white shrink-0">Allocation Blueprint</h1>
        {cohortLabel && <span className="text-xs text-gray-500 shrink-0">— {cohortLabel}</span>}
        {summary && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 ml-2">
            {SUMMARY_ITEMS.map(item => (
              <span key={item.key} className="flex items-baseline gap-1.5">
                {/* The number is the thing being scanned, so it carries the
                    size and the colour; the label stays quiet behind it. */}
                <span className={`text-base font-semibold tabular-nums leading-none ${item.tone}`}>
                  {summary[item.key]}
                </span>
                <span className="text-xs text-gray-500 leading-none">{item.label}</span>
              </span>
            ))}
          </div>
        )}
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
              value={stageFilter}
              onChange={v => handleStageFilterChange(v as string)}
              options={STAGE_ORDER.map(s => ({ value: s, label: STAGE_LABELS[s] }))}
              placeholder="All Statuses"
              className="min-w-[160px] !text-xs !py-1.5"
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
            {counts && (
              <span className="text-xs text-gray-500 shrink-0">{total} student{total === 1 ? '' : 's'}</span>
            )}
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
                      <th key={c.key} className="px-4 py-3">{c.label}</th>
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
                      <tr key={s.id} className="border-b border-zinc-800 last:border-0">
                        <td className="px-4 py-3 text-white font-medium">{s.fullName || '—'}</td>
                        <td className="px-4 py-3 text-gray-300">{s.batch || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${STAGE_TEXT[s.stage]}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${STAGE_DOT[s.stage]}`} />
                            {STAGE_LABELS[s.stage]}
                          </span>
                        </td>
                        {activeColumns.map(c => (
                          <td key={c.key} className="px-4 py-3 text-gray-300">{c.value(s)}</td>
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
          {AVAILABLE_COLUMNS.map(c => {
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
