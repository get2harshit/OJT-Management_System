import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { LayoutGrid, Plus, Download } from 'lucide-react';
import SpinnerSquare from '../../../components/SpinnerSquare';
import Select from '../../../components/Select';
import Drawer from '../../../components/Drawer';
import DataTable from '../../../components/DataTable';
import CohortPageHeader from './CohortPageHeader';
import type { AllocationBlueprintCounts, AllocationBlueprintStage, AllocationBlueprintStudent, AllocationBlueprintSummary } from '../../../lib/api/allocations';
import { apiGetCohort, apiGetAllocationBlueprint, apiGetAllocationBlueprintStudents } from '../../../lib/api';
import { getCohortLabel } from '../../../lib/cohortLabel';
import { exportToCSV } from '../../../lib/csvExport';
import { useToast } from '../../../toast';
import { usePageRefresh } from '../../../context/RefreshContext';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

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
  const { showError } = useToast();

  const [cohortLabel, setCohortLabel] = useState('');
  const [allowedBatches, setAllowedBatches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<AllocationBlueprintCounts | null>(null);
  const [summary, setSummary] = useState<AllocationBlueprintSummary | null>(null);

  const [stageFilter, setStageFilter] = useState<AllocationBlueprintStage | ''>('');
  const [batchFilter, setBatchFilter] = useState('');
  // The search box belongs to DataTable now, so only the debounced value that
  // the fetch actually runs on is held here.
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

  // Name/Batch/Status always, then whatever the admin added. Built from the
  // same AVAILABLE_COLUMNS entries the CSV export reads, so a column shows the
  // same thing on screen as in the file.
  const columns = useMemo(
    () => [
      {
        key: 'fullName',
        header: 'Student Name',
        render: (s: AllocationBlueprintStudent) => (
          <span className="text-white font-medium">{s.fullName || '—'}</span>
        ),
      },
      {
        key: 'batch',
        header: 'Batch',
        render: (s: AllocationBlueprintStudent) => s.batch || '—',
      },
      {
        key: 'stage',
        header: 'Status',
        render: (s: AllocationBlueprintStudent) => (
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${STAGE_TEXT[s.stage]}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${STAGE_DOT[s.stage]}`} />
            {STAGE_LABELS[s.stage]}
          </span>
        ),
      },
      ...activeColumns.map(c => ({
        key: c.key,
        header: c.label,
        render: (s: AllocationBlueprintStudent) => c.value(s),
      })),
    ],
    [activeColumns]
  );

  return (
    <div className="space-y-3">
      <CohortPageHeader
        title="Allocation Blueprint"
        subtitle={cohortLabel || undefined}
        icon={LayoutGrid}
        trailing={
          summary ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 ml-1">
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
          ) : null
        }
      />

      {loading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : (
        <DataTable<AllocationBlueprintStudent>
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
